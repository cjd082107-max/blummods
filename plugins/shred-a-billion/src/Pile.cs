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
        }

        static void Capture(object __instance) { Instance = __instance; }

        internal static bool Ready => Instance != null;
        internal static long Remaining => Ready ? Convert.ToInt64(AccessTools.PropertyGetter(_type, "BillsRemaining").Invoke(Instance, null)) : -1;

        // Takes up to `notes` bills out of the pile anywhere in the vault. Returns how many went.
        internal static long Remove(UnityEngine.Vector3 near, long notes)
        {
            var take = _type.GetMethods().FirstOrDefault(m => m.Name == "Take" && m.GetParameters().Length == 4);
            if (take == null) throw new MissingMethodException("MoneyPile", "Take");
            var output = Activator.CreateInstance(take.GetParameters()[3].ParameterType);
            long total = 0;
            // In chunks, so one huge gift can't stall a frame for too long.
            for (int i = 0; i < 40 && total < notes; i++)
            {
                var got = Convert.ToInt64(take.Invoke(Instance, new object[] { near, 2000f, notes - total, output }));
                AccessTools.Method(output.GetType(), "Clear")?.Invoke(output, null);
                if (got <= 0) break;
                total += got;
            }
            return total;
        }

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
