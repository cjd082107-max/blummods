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

        // jail (rules: Standard Events note). Caged right where he stands, in sight of the money but unable to
        // touch it: solid see-through cell, no snap-back, tools frozen, nothing earned.
        static bool _jailed;
        internal static bool Jailed => _jailed;
        static double _jailUntil, _lastEscapeAt;
        static Vector3 _cell;
        static Quaternion _preRot;
        static readonly List<GameObject> Cage = new List<GameObject>();
        static Material _barMat, _trimMat;
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
            if (Jailed) TickJail(player);
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
                    _cell = player.Position; _preRot = player.Root.rotation;
                    _jailed = true; _lastEscapeAt = 0;
                    _jailUntil = Now + seconds;
                    try { BuildCell(_cell); } catch (Exception e) { Fail("building the cell", e); }
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

        static Vector3 V(float x, float y, float z) { var v = default(Vector3); v.x = x; v.y = y; v.z = z; return v; }
        static Color C(float r, float g, float b) { var c = default(Color); c.r = r; c.g = g; c.b = b; c.a = 1f; return c; }

        static void TickJail(PlayerController player)
        {
            if (Now >= _jailUntil) { EndJail("Jail time is over"); return; }
            // Walls are solid, so he is never moved while inside. This only catches being thrown clear of the cell.
            var p = player.Position;
            float dx = p.x - _cell.x, dz = p.z - _cell.z, dy = p.y - _cell.y;
            if ((dx * dx + dz * dz > 4.5f * 4.5f || dy < -4f || dy > 9f) && Now - _lastEscapeAt >= 1.0)
            {
                _lastEscapeAt = Now;
                player.Teleport(V(_cell.x, _cell.y + 0.3f, _cell.z), _preRot);
            }
        }

        static void EndJail(string message)
        {
            _jailed = false;
            ClearCage();            // he is free right where he stands
            Plugin.Say(message);
        }

        static void ClearCage()
        {
            foreach (var g in Cage) { try { if (g != null) UnityEngine.Object.Destroy(g); } catch { } }
            Cage.Clear();
        }

        // Cartoony, bubbly cell to suit the game: chunky rounded candy-colored bars with bubble caps,
        // on a solid floor with a solid roof. The bars are closer together than the player is wide.
        static void BuildCell(Vector3 top)
        {
            const int bars = 22; const float radius = 2.3f, barHalf = 1.7f;
            EnsureMaterials();
            Piece(PrimitiveType.Cube, V(top.x, top.y - 0.2f, top.z), V(5.4f, 0.4f, 5.4f), _trimMat);                 // floor
            Piece(PrimitiveType.Cube, V(top.x, top.y + barHalf * 2 + 0.25f, top.z), V(5.4f, 0.3f, 5.4f), _trimMat);  // roof
            for (var i = 0; i < bars; i++)
            {
                var a = i * (2 * Math.PI / bars);
                float x = top.x + (float)Math.Cos(a) * radius, z = top.z + (float)Math.Sin(a) * radius;
                Piece(PrimitiveType.Cylinder, V(x, top.y + barHalf, z), V(0.34f, barHalf, 0.34f), _barMat);
                Piece(PrimitiveType.Sphere, V(x, top.y + 0.12f, z), V(0.52f, 0.52f, 0.52f), _trimMat);               // bubble foot
            }
            Piece(PrimitiveType.Sphere, V(top.x, top.y + barHalf * 2 + 0.75f, top.z), V(1.3f, 1.3f, 1.3f), _barMat); // bubble on top
        }

        static void Piece(PrimitiveType type, Vector3 pos, Vector3 scale, Material mat)
        {
            var g = GameObject.CreatePrimitive(type);
            g.name = "BlumMods jail";
            var t = g.transform;
            t.position = pos;
            t.localScale = scale;
            Cage.Add(g);
            if (mat == null) return;
            try { var r = g.GetComponent<Renderer>(); if (r != null) r.sharedMaterial = mat; }
            catch (Exception e) { Fail("cell colors", e); }
        }

        // Glossy candy colors using a shader the game already ships, so the cell is lit like everything else.
        static void EnsureMaterials()
        {
            if (_barMat != null && _trimMat != null) return;
            try
            {
                _barMat = Candy(C(0.62f, 0.64f, 0.68f));   // light steel grey
                _trimMat = Candy(C(0.30f, 0.31f, 0.35f));  // dark slate grey
            }
            catch (Exception e) { _barMat = null; _trimMat = null; Fail("cell colors", e); }
        }

        static Material Candy(Color color)
        {
            Material m = null;
            foreach (var name in new[] { "Universal Render Pipeline/Lit", "Universal Render Pipeline/Simple Lit" })
            {
                var shader = Shader.Find(name);
                if (shader != null) { m = new Material(shader); break; }
            }
            if (m == null) return null; // keep Unity's default look rather than guess
            foreach (var prop in new[] { "_BaseColor", "_Color" }) if (m.HasProperty(prop)) m.SetColor(prop, color);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", 0.55f);
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", 0f);
            return m;
        }
    }
}
