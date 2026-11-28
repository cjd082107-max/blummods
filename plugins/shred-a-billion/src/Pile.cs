using System;
using System.IO;
using System.Linq;
using System.Reflection;
using HarmonyLib;

namespace BlumMods.ShredABillion
{
    // The bill pile (the thing he has to clear to win) and save backups.
    // MoneyPile isn't in our stubs: its instance is caught through a hook on BillsRemaining (the HUD reads it constantly)
    // and its methods are called by name. Signatures from Game.World.Pile interop, 2026-11-27:
    //   long BillsRemaining / BillsTotal; long Take(Vector3 center, float radius, long maxNotes, List<..> output);
    //   void Return(Vector3 position, long notes); void Refill(); void ResetToNew()
    internal static class Pile
    {
        internal static object Instance;
        static Type _type;

        internal static void Hook(Harmony harmony)
        {
            try
            {
                try { Assembly.Load("Game.World.Pile"); } catch { }
                _type = AccessTools.TypeByName("Game.World.Pile.MoneyPile");
                var getter = _type == null ? null : AccessTools.PropertyGetter(_type, "BillsRemaining");
                if (getter == null) { Plugin.L.LogWarning("MoneyPile.BillsRemaining not found: bill events won't work"); return; }
                harmony.Patch(getter, postfix: new HarmonyMethod(typeof(Pile), nameof(Capture)));
                Plugin.L.LogInfo("Hooked MoneyPile.BillsRemaining");
            }
            catch (Exception e) { Plugin.L.LogError("Could not hook the money pile: " + e); }
            // The shredder service, so removed bills can be paid out like real shredding.
            try
            {
                try { Assembly.Load("Game.Machines"); } catch { }
                _depositType = AccessTools.TypeByName("Game.Machines.DepositService");
                foreach (var m in new[] { AccessTools.Method(_depositType, "Awake"), AccessTools.PropertyGetter(_depositType, "QueuedNotes") })
                    if (m != null) harmony.Patch(m, postfix: new HarmonyMethod(typeof(Pile), nameof(CaptureDeposit)));
                Plugin.L.LogInfo("Hooked DepositService");
            }
            catch (Exception e) { Plugin.L.LogError("Could not hook the shredder service (removed bills won't pay): " + e); }
        }

        static void Capture(object __instance) { Instance = __instance; }
        static void CaptureDeposit(object __instance) { Deposit = __instance; }
        internal static object Deposit;
        static Type _depositType;

        internal static bool Ready => Instance != null;
        internal static long Remaining => Ready ? Convert.ToInt64(AccessTools.PropertyGetter(_type, "BillsRemaining").Invoke(Instance, null)) : -1;

        // Takes up to `notes` bills from the main pile, wherever the streamer is (Carter, 2026-11-27).
        // The game caps one grab's radius (MoneyPile.TakeRadiusMax), so grabs start at the vault's centre
        // (static Game.Core.VaultLayout.Center, where the big pile sits) and spiral outwards to the vault's corners
        // (VaultLayout.HalfSize) until enough bills are taken. Grabs are made at the floor height of each spot
        // (MoneyPile.VaultFloor), then at the streamer's height, so where he stands never decides it.
        // When pay is true, the taken bills go through the game's own shredder (DepositService.ShredNow),
        // so they pay exactly what shredding them would with his upgrades, and count toward the billion.
        // Returns how many bills went; paid tells whether they were paid out.
        internal static long Remove(UnityEngine.Vector3 near, long notes, bool pay, out bool paid)
        {
            paid = false;
            var take = _type.GetMethods().FirstOrDefault(m => m.Name == "Take" && m.GetParameters().Length == 4);
            if (take == null) throw new MissingMethodException("MoneyPile", "Take");
            var output = Activator.CreateInstance(take.GetParameters()[3].ParameterType);
            var clear = AccessTools.Method(output.GetType(), "Clear");

            float cx = near.x, cz = near.z, spread = 60f;
            var where = "around the streamer (vault centre not found)";
            try
            {
                try { Assembly.Load("Game.Core"); } catch { }
                var layout = AccessTools.TypeByName("Game.Core.VaultLayout");
                var c = (UnityEngine.Vector2)AccessTools.PropertyGetter(layout, "Center").Invoke(null, null);
                var half = Convert.ToSingle(AccessTools.PropertyGetter(layout, "HalfSize").Invoke(null, null));
                cx = c.x; cz = c.y;
                if (half > 1f) spread = half * 1.45f; // out to the corners
                where = "vault centre " + cx.ToString("0.#") + ", " + cz.ToString("0.#") + " (half size " + half.ToString("0.#") + ")";
            }
            catch (Exception e) { Plugin.L.LogWarning("Vault centre not found: " + (e.InnerException ?? e).Message); }
            var floorAt = AccessTools.Method(_type, "VaultFloor");
            float reach = 3f;
            try { reach = Math.Max(1f, Convert.ToSingle(AccessTools.PropertyGetter(_type, "TakeRadiusMax")?.Invoke(null, null) ?? 3f)); } catch { }

            // Tally the taken bills by tier for the shredder.
            object tally = null; MethodInfo addSamples = null;
            if (pay && Deposit != null)
            {
                var shredNow = AccessTools.Method(_depositType, "ShredNow");
                var tallyType = shredNow?.GetParameters()[0].ParameterType.GetElementType();
                if (tallyType != null) { tally = Activator.CreateInstance(tallyType); addSamples = AccessTools.Method(tallyType, "AddSamples"); }
            }

            long total = 0;
            var step = reach * 1.6f;
            for (int ring = 0; total < notes && ring * step <= spread; ring++)
            {
                var spots = ring == 0 ? 1 : (int)Math.Ceiling(2 * Math.PI * ring * step / step);
                for (int k = 0; k < spots && total < notes; k++)
                {
                    var a = 2 * Math.PI * k / spots;
                    float x = cx + (float)(Math.Cos(a) * ring * step), z = cz + (float)(Math.Sin(a) * ring * step);
                    float floorY = near.y;
                    try { if (floorAt != null) floorY = Convert.ToSingle(floorAt.Invoke(Instance, new object[] { x, z })) + 0.5f; } catch { }
                    foreach (var y in new[] { floorY, near.y })
                    {
                        var at = V(x, y, z);
                        long here = 0;
                        for (int i = 0; i < 20 && total < notes; i++) // the same spot again until it is empty
                        {
                            var got = Convert.ToInt64(take.Invoke(Instance, new object[] { at, reach, notes - total, output }));
                            if (got > 0 && addSamples != null) { var args = new object[] { output, 0 }; addSamples.Invoke(tally, args); }
                            clear?.Invoke(output, null);
                            if (got <= 0) break;
                            total += got; here += got;
                        }
                        if (here > 0 || total >= notes) break; // that height worked: no need to try the other
                    }
                }
            }

            Plugin.L.LogInfo("Remove bills: took " + total + " of " + notes + " from " + where + ", grab radius " + reach.ToString("0.##"));
            if (total > 0 && tally != null)
            {
                try
                {
                    var shredNow = AccessTools.Method(_depositType, "ShredNow");
                    var ps = shredNow.GetParameters();
                    var intake = AccessTools.PropertyGetter(_depositType, "ShredderIntake")?.Invoke(Deposit, null) ?? near;
                    shredNow.Invoke(Deposit, new object[] { tally, intake, Enum.ToObject(ps[2].ParameterType, 0) }); // IncomeSource.Hand: paid like his own shredding
                    paid = true;
                }
                catch (Exception e) { Plugin.Say("Removed bills couldn't be paid out: " + (e.InnerException ?? e).Message); }
            }
            return total;
        }

        static UnityEngine.Vector3 V(float x, float y, float z) { var v = default(UnityEngine.Vector3); v.x = x; v.y = y; v.z = z; return v; }

        internal static void Add(UnityEngine.Vector3 at, long notes)
        {
            var ret = _type.GetMethods().FirstOrDefault(m => m.Name == "Return" && m.GetParameters().Length == 2);
            if (ret == null) throw new MissingMethodException("MoneyPile", "Return");
            ret.Invoke(Instance, new object[] { at, notes });
        }

        internal static void ResetToNew() => AccessTools.Method(_type, "ResetToNew").Invoke(Instance, null);

        // Plays the game's own ending (Game.Finale.FinaleDirector.Begin()). Returns null if it started, else why not.
        internal static string PlayEnding()
        {
            try
            {
                try { Assembly.Load("Game.Finale"); } catch { }
                var t = AccessTools.TypeByName("Game.Finale.FinaleDirector");
                if (t == null) return "FinaleDirector not found";
                var inst = AccessTools.PropertyGetter(t, "Instance")?.Invoke(null, null);
                if (inst == null) return "no ending in this scene";
                if (Convert.ToBoolean(AccessTools.PropertyGetter(t, "Active")?.Invoke(inst, null) ?? false)) return "it is already playing";
                var begin = t.GetMethods().FirstOrDefault(m => m.Name == "Begin" && m.GetParameters().Length == 0);
                if (begin == null) return "Begin() not found";
                begin.Invoke(inst, null);
                return null;
            }
            catch (Exception e) { return (e.InnerException ?? e).GetType().Name + ": " + (e.InnerException ?? e).Message; }
        }

        // Copies save.json / save.bak (and the Saves folder) into a dated BlumMods backup folder before any reset.
        internal static string BackupSave()
        {
            var dir = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "AppData", "LocalLow", "LightTriadGames", "SHRED A BILLION");
            if (!Directory.Exists(dir)) return null;
            var dest = Path.Combine(dir, "BlumMods backups", DateTime.Now.ToString("yyyy-MM-dd HH-mm-ss"));
            Directory.CreateDirectory(dest);
            foreach (var f in Directory.GetFiles(dir, "save*")) File.Copy(f, Path.Combine(dest, Path.GetFileName(f)), true);
            var saves = Path.Combine(dir, "Saves");
            if (Directory.Exists(saves))
                foreach (var f in Directory.GetFiles(saves, "*", SearchOption.AllDirectories))
                {
                    var to = Path.Combine(dest, "Saves", f.Substring(saves.Length + 1));
                    Directory.CreateDirectory(Path.GetDirectoryName(to));
                    File.Copy(f, to, true);
                }
            return dest;
        }
    }
}
