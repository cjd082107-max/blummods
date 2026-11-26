using System;
using Game.Core;
using Game.Player;
using Game.Progression;
using HarmonyLib;

namespace BlumMods.ShredABillion
{
    internal static class Patches
    {
        // Runs every frame on the game's main thread, with the player in hand.
        [HarmonyPatch(typeof(PlayerController), nameof(PlayerController.Update))]
        internal static class PlayerUpdate
        {
            static void Postfix(PlayerController __instance)
            {
                try { Effects.Tick(__instance); }
                catch (Exception e) { Effects.Fail("tick", e); }
            }
        }

        // Every dollar the game hands out passes through here: remember the wallet and apply the multiplier.
        [HarmonyPatch(typeof(EconomyService), nameof(EconomyService.Add))]
        internal static class EconomyAdd
        {
            static void Prefix(EconomyService __instance, ref double amount)
            {
                try
                {
                    Effects.Economy = __instance;
                    if (Effects.OwnAdd || amount <= 0) return;
                    if (Effects.Jailed) { amount = 0; return; } // no earning from inside the cell
                    if (Effects.MultiplierActive) amount *= Effects.Multiplier;
                }
                catch (Exception e) { Effects.Fail("money hook", e); }
            }
        }

        [HarmonyPatch(typeof(EconomyService), nameof(EconomyService.Awake))]
        internal static class EconomyAwake
        {
            static void Postfix(EconomyService __instance) { Effects.Economy = __instance; }
        }
    }
}
