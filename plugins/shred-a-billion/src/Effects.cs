using System;
using System.Collections.Generic;
using System.Diagnostics;
using Game.Core;
using Game.Player;
using Game.Progression;
using Game.Stream;
using UnityEngine;

namespace BlumMods.ShredABillion
{
    internal static class Effects
    {
        internal static EconomyService Economy;
        internal static bool OwnAdd;
        internal static double Multiplier = 1;
        static double _multiplierUntil;
        internal static bool MultiplierActive => Now < _multiplierUntil;

        static readonly Stopwatch Clock = Stopwatch.StartNew();
        static double Now => Clock.Elapsed.TotalSeconds;

        // jail
        static double _jailUntil;
        static bool _jailed, _jailNeedsSpot;
        static int _jailSettleFrames;
        static Vector3 _jailPos;
        static readonly List<GameObject> Cage = new List<GameObject>();
        static bool _multiplierWasActive;
        static int _failures;

        internal static void Fail(string where, Exception e)
        {
            if (_failures++ > 20) return; // don't flood the log every frame
            Plugin.Say("Problem in " + where + ": " + e.GetType().Name + ": " + e.Message);
            try { Plugin.L.LogError(e); } catch { }
        }

        internal static void Tick(PlayerController player)
        {
            while (Bridge.Incoming.TryDequeue(out var cmd))
            {
                try { Run(cmd, player); }
                catch (Exception e) { Fail("'" + cmd.Name + "'", e); }
            }
            if (_jailed) TickJail(player);
            if (_multiplierWasActive && !MultiplierActive) { _multiplierWasActive = false; Plugin.Say("Money multiplier ended"); }
        }

        static void Run(Command c, PlayerController player)
        {
            var who = string.IsNullOrEmpty(c.Viewer) ? "" : " (" + c.Viewer + ")";
            switch (c.Name)
            {
                case "jail":
                {
                    var seconds = Clamp(c.Num("seconds", 15), 1, 600);
                    if (_jailed) { _jailUntil += seconds; Plugin.Say("Jail extended by " + seconds + "s" + who); break; }
                    player.Respawn();
                    _jailed = true; _jailNeedsSpot = true; _jailSettleFrames = 3;
                    _jailUntil = Now + seconds;
                    Plugin.Say("Jailed for " + seconds + "s" + who);
                    break;
                }
                case "unjail":
                    if (_jailed) EndJail("Freed from jail" + who);
                    break;
                case "add_money":
                {
                    var amount = Clamp(c.Num("amount", 1000), 0, 1e15);
                    if (Economy == null) { Plugin.Say("Can't add money yet: earn any money in the game first so the mod can find your wallet"); break; }
                    OwnAdd = true;
                    try { Economy.Add(amount, IncomeSource.Reward); } finally { OwnAdd = false; }
                    Plugin.Say("Added $" + amount.ToString("N0") + who);
                    break;
                }
                case "remove_money":
                {
                    var amount = Clamp(c.Num("amount", 1000), 0, 1e15);
                    if (Economy == null) { Plugin.Say("Can't remove money yet: earn any money in the game first so the mod can find your wallet"); break; }
                    var take = Math.Min(amount, Economy.Dollars);
                    if (take > 0) Economy.TrySpend(take);
                    Plugin.Say("Removed $" + take.ToString("N0") + who);
                    break;
                }
                case "money_multiplier":
                {
                    Multiplier = Clamp(c.Num("multiplier", 2), 0, 1000);
                    var seconds = Clamp(c.Num("seconds", 30), 1, 3600);
                    _multiplierUntil = Now + seconds;
                    _multiplierWasActive = true;
                    Plugin.Say(Multiplier + "x money for " + seconds + "s" + who);
                    break;
                }
                case "launch":
                {
                    var power = (float)Clamp(c.Num("power", 1), 0.1, 10);
                    var stream = StreamSystem.Instance;
                    var actions = stream != null ? stream._actions : null;
                    if (actions == null) { Plugin.Say("Launch needs the game's stream mode running (start a stream run in the game)"); break; }
                    var result = actions.Launch(power);
                    Plugin.Say("Launched" + who + (string.IsNullOrEmpty(result) ? "" : " [" + result + "]"));
                    break;
                }
                default:
                    Plugin.Say("This mod doesn't know the action '" + c.Name + "'. Update the BlumMods plugin.");
                    break;
            }
        }

        static double Clamp(double v, double min, double max) => v < min ? min : v > max ? max : v;

        static void TickJail(PlayerController player)
        {
            if (_jailNeedsSpot)
            {
                if (_jailSettleFrames-- > 0) return; // let the respawn land first
                _jailPos = player.Position;
                _jailNeedsSpot = false;
                try { BuildCage(_jailPos); } catch (Exception e) { Fail("cage", e); }
            }
            var p = player.Position;
            float dx = p.x - _jailPos.x, dy = p.y - _jailPos.y, dz = p.z - _jailPos.z;
            if (dx * dx + dz * dz > 1.1f * 1.1f || dy > 2.5f || dy < -2.5f)
                player.Teleport(_jailPos, player.Root.rotation);
            if (Now >= _jailUntil) EndJail("Jail time is over");
        }

        static void EndJail(string message)
        {
            _jailed = false;
            foreach (var g in Cage) { try { if (g != null) UnityEngine.Object.Destroy(g); } catch { } }
            Cage.Clear();
            Plugin.Say(message);
        }

        static Vector3 V(float x, float y, float z) { var v = default(Vector3); v.x = x; v.y = y; v.z = z; return v; }

        // A ring of bars around the spot, with a lid.
        static void BuildCage(Vector3 at)
        {
            const int bars = 14; const float radius = 1.5f, height = 3.2f;
            for (var i = 0; i < bars; i++)
            {
                var a = i * (2 * Math.PI / bars);
                Bar(V(at.x + (float)Math.Cos(a) * radius, at.y + height / 2 - 0.2f, at.z + (float)Math.Sin(a) * radius), V(0.14f, height, 0.14f));
            }
            Bar(V(at.x, at.y + height - 0.1f, at.z), V(radius * 2 + 0.3f, 0.16f, radius * 2 + 0.3f));
        }

        static void Bar(Vector3 pos, Vector3 scale)
        {
            var g = GameObject.CreatePrimitive(PrimitiveType.Cube);
            g.name = "BlumMods cage";
            var t = g.transform;
            t.position = pos;
            t.localScale = scale;
            Cage.Add(g);
        }
    }
}
