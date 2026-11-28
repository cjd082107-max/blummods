using System;
using BepInEx;
using BepInEx.Logging;
using BepInEx.Unity.IL2CPP;
using HarmonyLib;

namespace BlumMods.ShredABillion
{
    [BepInPlugin(Id, "BlumMods for SHRED A BILLION", Version)]
    public class Plugin : BasePlugin
    {
        public const string Id = "blummods.shredabillion";
        public const string Version = "0.6.1";
        internal static ManualLogSource L;

        public override void Load()
        {
            L = Log;
            var harmony = new Harmony(Id);
            // Patch one at a time so one missing game method can't take the others down with it.
            foreach (var t in new[] { typeof(Patches.PlayerUpdate), typeof(Patches.EconomyAdd), typeof(Patches.EconomyAwake), typeof(Patches.ToolsUpdate) })
            {
                try { harmony.CreateClassProcessor(t).Patch(); Log.LogInfo("Hooked " + t.Name); }
                catch (Exception e) { Log.LogError("Could not hook " + t.Name + ": " + e); }
            }
            Pile.Hook(harmony);
            Bridge.Start();
            Log.LogInfo("BlumMods plugin " + Version + " loaded");
        }

        internal static void Say(string text)
        {
            try { L.LogInfo(text); } catch { }
            Bridge.Log(text);
        }
    }
}
