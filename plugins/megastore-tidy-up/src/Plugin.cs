using System;
using BepInEx;
using BepInEx.Logging;
using HarmonyLib;
using UnityEngine;
using UnityEngine.Rendering;

namespace BlumMods.MegastoreTidyUp
{
    // BepInEx 5 plugin (Mono game). BaseUnityPlugin is a MonoBehaviour, so Update/LateUpdate tick for free.
    [BepInPlugin(Id, "BlumMods for Megastore: Tidy Up Together", Version)]
    public class Plugin : BaseUnityPlugin
    {
        public const string Id = "blummods.megastoretidyup";
        public const string Version = "0.4.0";
        internal static ManualLogSource L;
        internal static Plugin Instance;

        void Awake()
        {
            L = Logger;
            Instance = this;
            var harmony = new Harmony(Id);
            // While jailed, every way of interacting with the store is switched off.
            // Each hook goes on separately so one renamed game method can't take the others down.
            Block(harmony, "RayShooter", "OnLeftMouseDown");
            Block(harmony, "RayShooter", "OnRightMouseDown");
            Block(harmony, "RayShooter", "OnInteractionClicked");
            Block(harmony, "Product", "OnMouseButtonDown");
            Block(harmony, "Product", "OnMouseRMBDown");
            Block(harmony, "SkillBehaviour", "Activate", returnsBool: true);
            // Skills that override Activate need their own hook.
            var skillBase = AccessTools.TypeByName("SkillBehaviour");
            if (skillBase != null)
                foreach (var t in AccessTools.AllTypes())
                    if (t != skillBase && skillBase.IsAssignableFrom(t) && AccessTools.DeclaredMethod(t, "Activate") != null)
                        Block(harmony, t.FullName, "Activate", returnsBool: true);
            RenderPipelineManager.beginCameraRendering += (ctx, cam) => Effects.BeforeCameraRender(cam);
            RenderPipelineManager.endCameraRendering += (ctx, cam) => Effects.AfterCameraRender(cam);
            Bridge.Start();
            L.LogInfo("BlumMods plugin " + Version + " loaded");
        }

        void Block(Harmony harmony, string type, string method, bool returnsBool = false)
        {
            try
            {
                var target = AccessTools.Method(AccessTools.TypeByName(type), method);
                if (target == null) { L.LogWarning("Could not find " + type + "." + method + " (jail can't block it)"); return; }
                var prefix = new HarmonyMethod(typeof(Plugin), returnsBool ? nameof(JailBlockBool) : nameof(JailBlock));
                harmony.Patch(target, prefix: prefix);
                L.LogInfo("Hooked " + type + "." + method);
            }
            catch (Exception e) { L.LogError("Could not hook " + type + "." + method + ": " + e.Message); }
        }

        // Returning false skips the game's method.
        static bool JailBlock() => !Effects.Jailed;
        static bool JailBlockBool(ref bool __result)
        {
            if (!Effects.Jailed) return true;
            __result = false;
            return false;
        }

        void Update()
        {
            while (Bridge.Incoming.TryDequeue(out var cmd)) Effects.Run(cmd);
            Effects.Tick();
            ResetBox.Apply();
            Popups.Apply();
        }

        void OnGUI()
        {
            Popups.Draw();
            ResetBox.Draw();
        }

        internal static void Say(string text)
        {
            try { L.LogInfo(text); } catch { }
            Bridge.Log(text);
        }
    }
}
