using System;
using System.Collections.Generic;
using UnityEngine;

namespace BlumMods.MegastoreTidyUp
{
    // What each command does. Everything here runs on Unity's main thread (called from Plugin.Update).
    internal static class Effects
    {
        // ---------- timers ----------
        static float _jailUntil, _speedUntil, _slowUntil, _jumpUntil, _moonUntil, _freezeUntil, _darkUntil, _drunkUntil;
        static float _speedMult = 2f;
        static float _rollStart = -1f, _rollEnd, _rollTurns;
        internal static bool Jailed => _cell != null;

        // ---------- remembered game values (restored when an effect ends) ----------
        static Component _tunedPlayer;
        static float _baseWalk, _baseRun, _baseJump;
        static float _baseExtraFall, _baseFallMult;
        static Vector3 _baseGravity;
        static bool _gravityTuned, _frozeIt, _wasLocked;
        static readonly List<Light> _darkened = new List<Light>();
        static float _baseAmbientIntensity, _baseReflection;
        static Color _baseAmbient;

        static int _fails;

        internal static void Run(Command c)
        {
            var who = string.IsNullOrEmpty(c.Viewer) ? "Someone" : c.Viewer;
            try
            {
                if (Game.Player == null && c.Name != "unjail") { Plugin.Say(who + " sent " + c.Name + ", but no store is loaded yet. Start or join a store first."); return; }
                switch (c.Name)
                {
                    case "jail": Jail(who, Clamp(c.Num("seconds", 15), 1, 600)); break;
                    case "unjail": Unjail(who); break;
                    case "speed_boost": SpeedBoost(who, Clamp(c.Num("multiplier", 2), 1.1, 5), Clamp(c.Num("seconds", 20), 1, 600)); break;
                    case "slow_walk": _slowUntil = Extend(_slowUntil, Clamp(c.Num("seconds", 15), 1, 600)); ApplySpeed(); Plugin.Say(who + " slowed the streamer to a crawl for " + Left(_slowUntil)); break;
                    case "super_jump": _jumpUntil = Extend(_jumpUntil, Clamp(c.Num("seconds", 20), 1, 600)); ApplyJump(); Plugin.Say(who + " gave the streamer super jump for " + Left(_jumpUntil)); break;
                    case "moon_gravity": _moonUntil = Extend(_moonUntil, Clamp(c.Num("seconds", 20), 1, 600)); ApplyGravity(); Plugin.Say(who + " switched on moon gravity for " + Left(_moonUntil)); break;
                    case "freeze": Freeze(who, Clamp(c.Num("seconds", 5), 1, 120)); break;
                    case "launch": Launch(who, Clamp(c.Num("power", 1), 0.1, 5)); break;
                    case "magnet": UseSkill(who, "MagnetPullSkill", "Magnet", Clamp(c.Num("seconds", 10), 1, 120)); break;
                    case "shelf_glow": UseSkill(who, "TargetShelfGlowSkill", "Shelf glow", Clamp(c.Num("seconds", 15), 1, 120)); break;
                    case "give_xp": GiveXp(who, (int)Clamp(c.Num("amount", 100), 1, 100000)); break;
                    case "product_explosion": Explode(who, Clamp(c.Num("power", 1), 0.1, 5)); break;
                    case "product_rain": Rain(who, (int)Clamp(c.Num("count", 25), 1, 150)); break;
                    case "lights_out": LightsOut(who, Clamp(c.Num("seconds", 15), 1, 300)); break;
                    case "drunk_camera": _drunkUntil = Extend(_drunkUntil, Clamp(c.Num("seconds", 15), 1, 300)); Plugin.Say(who + " made the streamer dizzy for " + Left(_drunkUntil)); break;
                    case "barrel_roll": BarrelRoll(who, (int)Clamp(c.Num("rolls", 2), 1, 10)); break;
                    default: Plugin.Say("Unknown command: " + c.Name); break;
                }
            }
            catch (Exception e) { Fail(c.Name, e); }
        }

        internal static void Tick()
        {
            var now = Time.time;
            try
            {
                if (_jailUntil > 0 && now >= _jailUntil) EndJail("Jail time is up. The streamer is free.");
                if (_cell != null) KeepInCell();
                if (_speedUntil > 0 && now >= _speedUntil) { _speedUntil = 0; ApplySpeed(); Plugin.Say("Speed boost ended."); }
                if (_slowUntil > 0 && now >= _slowUntil) { _slowUntil = 0; ApplySpeed(); Plugin.Say("Slow walk ended."); }
                if (_jumpUntil > 0 && now >= _jumpUntil) { _jumpUntil = 0; ApplyJump(); Plugin.Say("Super jump ended."); }
                if (_moonUntil > 0 && now >= _moonUntil) { _moonUntil = 0; ApplyGravity(); Plugin.Say("Gravity is back to normal."); }
                if (_freezeUntil > 0)
                {
                    if (now >= _freezeUntil) { _freezeUntil = 0; Unfreeze(); Plugin.Say("The streamer can move again."); }
                    else Game.Set(Game.Player, "movementLocked", true);
                }
                if (_darkUntil > 0 && now >= _darkUntil) { _darkUntil = 0; LightsOn(); Plugin.Say("The lights are back on."); }
                if (_drunkUntil > 0 && now >= _drunkUntil) { _drunkUntil = 0; Plugin.Say("The streamer sobered up."); }
            }
            catch (Exception e) { Fail("tick", e); }
        }

        // ================= JAIL =================
        // A real jail cell: steel bars he can see out through, a concrete floor and roof, solid walls.
        // While he is inside, clicking, grabbing and skills are all blocked (see Plugin's hooks), so nothing progresses.
        static GameObject _cell;
        static Vector3 _cellCenter;
        static float _nextCheck;
        const float Half = 1.6f, Height = 2.7f;

        static void Jail(string who, double seconds)
        {
            if (_cell != null)
            {
                _jailUntil += (float)seconds;
                Plugin.Say(who + " added " + (int)seconds + "s of jail. " + Left(_jailUntil) + " left.");
                return;
            }
            _cellCenter = Game.Feet;
            _cell = BuildCell(_cellCenter);
            _jailUntil = Time.time + (float)seconds;
            Plugin.Say(who + " threw the streamer in jail for " + (int)seconds + "s. No sorting until it ends.");
        }

        static void Unjail(string who)
        {
            if (_cell == null) { Plugin.Say(who + " tried to free the streamer, but they're not in jail."); return; }
            EndJail(who + " broke the streamer out of jail.");
        }

        static void EndJail(string msg)
        {
            _jailUntil = 0;
            if (_cell != null) UnityEngine.Object.Destroy(_cell);
            _cell = null;
            Plugin.Say(msg);
        }

        // Safety net only: if a glitch puts him clearly outside the cell, put him back in the middle.
        static void KeepInCell()
        {
            if (Time.time < _nextCheck || Game.Player == null) return;
            _nextCheck = Time.time + 1f;
            var d = Game.Feet - _cellCenter;
            if (Mathf.Abs(d.x) > Half + 2.5f || Mathf.Abs(d.z) > Half + 2.5f || d.y < -2f || d.y > Height + 2f)
            {
                Game.Teleport(_cellCenter + Vector3.up * 0.1f);
                Plugin.Say("The streamer slipped out of jail, so they were put back in.");
            }
        }

        static GameObject BuildCell(Vector3 floor)
        {
            var root = new GameObject("BlumMods Jail Cell");
            root.transform.position = floor;
            var layer = FloorLayer(floor);
            var steel = Mat(new Color(0.20f, 0.22f, 0.25f), 0.9f, 0.55f);
            var concrete = Mat(new Color(0.52f, 0.52f, 0.50f), 0f, 0.15f);
            var plate = Mat(new Color(0.85f, 0.70f, 0.10f), 0.6f, 0.5f); // yellow warning plate, so it reads as a cell

            // Floor and roof slabs.
            Box(root, "Floor", new Vector3(0, -0.05f, 0), new Vector3(Half * 2 + 0.3f, 0.12f, Half * 2 + 0.3f), concrete, layer);
            Box(root, "Roof", new Vector3(0, Height + 0.08f, 0), new Vector3(Half * 2 + 0.3f, 0.16f, Half * 2 + 0.3f), concrete, layer);

            // Four walls of vertical bars with top, middle and bottom rails.
            const float gap = 0.24f; // centre to centre; the gaps are far narrower than he is
            for (int side = 0; side < 4; side++)
            {
                var along = side < 2 ? Vector3.right : Vector3.forward;
                var outward = side == 0 ? Vector3.forward : side == 1 ? Vector3.back : side == 2 ? Vector3.right : Vector3.left;
                var wallCenter = outward * Half;
                int bars = Mathf.RoundToInt(Half * 2 / gap);
                for (int i = 0; i <= bars; i++)
                {
                    var p = wallCenter + along * (-Half + i * gap) + Vector3.up * (Height / 2);
                    var bar = GameObject.CreatePrimitive(PrimitiveType.Cylinder);
                    bar.name = "Bar";
                    bar.transform.SetParent(root.transform, false);
                    bar.transform.localPosition = p;
                    bar.transform.localScale = new Vector3(0.06f, Height / 2, 0.06f);
                    bar.GetComponent<Renderer>().sharedMaterial = steel;
                    bar.layer = layer;
                }
                var railSize = side < 2 ? new Vector3(Half * 2 + 0.1f, 0.08f, 0.1f) : new Vector3(0.1f, 0.08f, Half * 2 + 0.1f);
                foreach (var y in new[] { 0.06f, Height * 0.55f, Height - 0.06f })
                    Box(root, "Rail", wallCenter + Vector3.up * y, railSize, steel, layer);

                // An invisible solid wall right behind the bars, so nothing can squeeze or reach through.
                var wallSize = side < 2 ? new Vector3(Half * 2, Height, 0.12f) : new Vector3(0.12f, Height, Half * 2);
                var wall = new GameObject("Wall");
                wall.transform.SetParent(root.transform, false);
                wall.transform.localPosition = wallCenter + Vector3.up * (Height / 2);
                wall.AddComponent<BoxCollider>().size = wallSize;
                wall.layer = layer;
            }
            // A small plate over the front, like a cell number.
            Box(root, "Plate", Vector3.forward * (Half + 0.06f) + Vector3.up * (Height - 0.35f), new Vector3(0.7f, 0.25f, 0.04f), plate, layer);
            return root;
        }

        static void Box(GameObject root, string name, Vector3 localPos, Vector3 size, Material mat, int layer)
        {
            var b = GameObject.CreatePrimitive(PrimitiveType.Cube);
            b.name = name;
            b.transform.SetParent(root.transform, false);
            b.transform.localPosition = localPos;
            b.transform.localScale = size;
            b.GetComponent<Renderer>().sharedMaterial = mat;
            b.layer = layer;
        }

        // Use the same physics layer as the floor he stands on, so his body collides with the cell like a real wall.
        static int FloorLayer(Vector3 feet)
        {
            var root = Game.Player != null ? Game.Player.transform.root : null;
            foreach (var hit in Physics.RaycastAll(feet + Vector3.up * 0.5f, Vector3.down, 3f, ~0, QueryTriggerInteraction.Ignore))
                if (root == null || hit.collider.transform.root != root) return hit.collider.gameObject.layer;
            return 0;
        }

        static Material Mat(Color color, float metallic, float smooth)
        {
            var shader = Shader.Find("Universal Render Pipeline/Lit") ?? Shader.Find("Universal Render Pipeline/Simple Lit") ?? Shader.Find("Standard");
            Material m;
            if (shader != null) m = new Material(shader);
            else
            {
                var tmp = GameObject.CreatePrimitive(PrimitiveType.Cube);
                m = new Material(tmp.GetComponent<Renderer>().sharedMaterial);
                UnityEngine.Object.Destroy(tmp);
            }
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", color);
            m.color = color;
            if (m.HasProperty("_Metallic")) m.SetFloat("_Metallic", metallic);
            if (m.HasProperty("_Smoothness")) m.SetFloat("_Smoothness", smooth);
            return m;
        }

        // ================= MOVEMENT =================
        static void Remember()
        {
            var p = Game.Player;
            if (p == null || p == _tunedPlayer) return;
            _tunedPlayer = p;
            _baseWalk = Game.Get(p, "walkSpeed", 4f);
            _baseRun = Game.Get(p, "runSpeed", 7f);
            _baseJump = Game.Get(p, "jumpForce", 5f);
            _baseExtraFall = Game.Get(p, "extraFallGravity", 0f);
            _baseFallMult = Game.Get(p, "fallGravityMultiplier", 1f);
        }

        static void SpeedBoost(string who, double mult, double seconds)
        {
            _speedMult = (float)mult;
            _speedUntil = Extend(_speedUntil, seconds);
            ApplySpeed();
            Plugin.Say(who + " gave the streamer " + mult.ToString("0.#") + "x speed for " + Left(_speedUntil));
        }

        static void ApplySpeed()
        {
            Remember();
            float m = 1f;
            if (_speedUntil > 0) m *= _speedMult;
            if (_slowUntil > 0) m *= 0.3f;
            Game.Set(Game.Player, "walkSpeed", _baseWalk * m);
            Game.Set(Game.Player, "runSpeed", _baseRun * m);
        }

        static void ApplyJump()
        {
            Remember();
            Game.Set(Game.Player, "jumpForce", _baseJump * (_jumpUntil > 0 ? 2.2f : 1f));
        }

        static void ApplyGravity()
        {
            Remember();
            if (_moonUntil > 0)
            {
                if (!_gravityTuned) { _baseGravity = Physics.gravity; _gravityTuned = true; }
                Physics.gravity = _baseGravity * 0.3f;
                Game.Set(Game.Player, "extraFallGravity", _baseExtraFall * 0.2f);
                Game.Set(Game.Player, "fallGravityMultiplier", Mathf.Max(0.2f, _baseFallMult * 0.3f));
            }
            else if (_gravityTuned)
            {
                Physics.gravity = _baseGravity;
                _gravityTuned = false;
                Game.Set(Game.Player, "extraFallGravity", _baseExtraFall);
                Game.Set(Game.Player, "fallGravityMultiplier", _baseFallMult);
            }
        }

        static void Freeze(string who, double seconds)
        {
            if (_freezeUntil <= 0) { _wasLocked = Game.Get(Game.Player, "movementLocked", false); _frozeIt = true; }
            _freezeUntil = Extend(_freezeUntil, seconds);
            Game.Set(Game.Player, "movementLocked", true);
            var rb = Game.PlayerBody;
            if (rb != null && !rb.isKinematic) rb.linearVelocity = Vector3.zero;
            Plugin.Say(who + " froze the streamer for " + Left(_freezeUntil));
        }

        static void Unfreeze()
        {
            if (_frozeIt) Game.Set(Game.Player, "movementLocked", _wasLocked);
            _frozeIt = false;
        }

        static void Launch(string who, double power)
        {
            if (Jailed) { Plugin.Say(who + " tried to launch the streamer, but jail has a roof."); return; }
            var rb = Game.PlayerBody;
            if (rb == null || rb.isKinematic) { Plugin.Say(who + " tried to launch the streamer, but the game wouldn't let them fly right now."); return; }
            var side = UnityEngine.Random.insideUnitCircle * 3f;
            rb.linearVelocity = new Vector3(side.x, 11f * (float)power, side.y);
            Plugin.Say(who + " launched the streamer into the air!");
        }

        // ================= HELPERS FROM THE GAME'S OWN SKILLS =================
        static void UseSkill(string who, string typeName, string label, double seconds)
        {
            var t = HarmonyLib.AccessTools.TypeByName(typeName);
            var skill = t != null ? UnityEngine.Object.FindObjectOfType(t) as Component : null;
            if (skill == null) { Plugin.Say(who + " sent " + label + ", but this store doesn't have that skill."); return; }
            if (Jailed) { Plugin.Say(who + " sent " + label + ", but it can't be used in jail."); return; }
            bool started = false;
            try
            {
                // Begin(until) runs the skill for a set time without spending his points or cooldown.
                var svc = Game.Singleton(Game.SkillServiceT);
                float clock = Game.Get(svc, "SkillTime", Time.time);
                Game.Call(skill, "Begin", clock + (float)seconds);
                started = Game.Get(skill, "IsRunning", true);
            }
            catch (Exception e) { Plugin.L.LogWarning(label + " Begin failed: " + e.Message); }
            if (!started)
            {
                try { started = (bool)Game.Call(skill, "Activate"); } catch { }
            }
            Plugin.Say(started ? who + " switched on " + label + " for " + (int)seconds + "s."
                               : who + " sent " + label + ", but the game wouldn't start it (the skill may still be locked).");
        }

        static void GiveXp(string who, int amount)
        {
            var svc = Game.Singleton(Game.SkillServiceT);
            var source = Game.EnumValue(Game.XpSourceT, "SHELF_COMPLETION");
            if (svc == null || source == null) { Plugin.Say(who + " sent XP, but the skill system isn't loaded."); return; }
            Game.Call(svc, "GrantXp", amount, source, Game.Feet + Vector3.up * 1.6f);
            Plugin.Say(who + " gave the streamer " + amount + " XP.");
        }

        // ================= MESS (never touches products already on shelves) =================
        static void Explode(string who, double power)
        {
            var center = Game.Feet;
            var items = Game.LooseProducts(center, 7f, 200);
            foreach (var p in items)
            {
                var away = p.transform.position - center; away.y = 0;
                if (away.sqrMagnitude < 0.01f) away = UnityEngine.Random.insideUnitSphere;
                var v = away.normalized * (6f * (float)power) + Vector3.up * (5f * (float)power);
                Game.Fling(p, v);
            }
            Plugin.Say(items.Count > 0 ? who + " blew up " + items.Count + " loose items around the streamer!" : who + " set off an explosion, but there was nothing loose nearby.");
        }

        static void Rain(string who, int count)
        {
            var center = Game.Feet;
            var items = Game.LooseProducts(center, 30f, count);
            if (Jailed) { Plugin.Say(who + " sent product rain, but jail has a roof."); return; }
            foreach (var p in items)
            {
                var off = UnityEngine.Random.insideUnitCircle * 1.6f;
                p.transform.position = center + new Vector3(off.x, 4f + UnityEngine.Random.value * 3f, off.y);
                Game.Fling(p, Vector3.down * 1f);
            }
            Plugin.Say(items.Count > 0 ? who + " made it rain " + items.Count + " products on the streamer!" : who + " sent product rain, but there was nothing loose to drop.");
        }

        // ================= LIGHTS =================
        static void LightsOut(string who, double seconds)
        {
            if (_darkUntil <= 0)
            {
                _darkened.Clear();
                foreach (var l in UnityEngine.Object.FindObjectsOfType<Light>())
                    if (l.enabled) { l.enabled = false; _darkened.Add(l); }
                _baseAmbient = RenderSettings.ambientLight;
                _baseAmbientIntensity = RenderSettings.ambientIntensity;
                _baseReflection = RenderSettings.reflectionIntensity;
                RenderSettings.ambientLight = new Color(0.03f, 0.03f, 0.05f);
                RenderSettings.ambientIntensity = 0.05f;
                RenderSettings.reflectionIntensity = 0.05f;
            }
            _darkUntil = Extend(_darkUntil, seconds);
            Plugin.Say(who + " turned off the lights for " + Left(_darkUntil));
        }

        static void LightsOn()
        {
            foreach (var l in _darkened) if (l != null) l.enabled = true;
            _darkened.Clear();
            RenderSettings.ambientLight = _baseAmbient;
            RenderSettings.ambientIntensity = _baseAmbientIntensity;
            RenderSettings.reflectionIntensity = _baseReflection;
        }

        // ================= CAMERA (applied only while the frame renders, so the game's own camera code is untouched) =================
        static Quaternion _savedRot;
        static float _savedFov;
        static Camera _tilted;

        static void BarrelRoll(string who, int rolls)
        {
            _rollStart = Time.time;
            _rollTurns = rolls;
            _rollEnd = Time.time + 0.9f * rolls;
            Plugin.Say(who + " sent the streamer's view into " + rolls + " barrel roll" + (rolls > 1 ? "s" : "") + "!");
        }

        internal static void BeforeCameraRender(Camera cam)
        {
            try
            {
                var now = Time.time;
                bool drunk = _drunkUntil > now, rolling = _rollStart >= 0 && now < _rollEnd;
                if (_rollStart >= 0 && now >= _rollEnd) _rollStart = -1;
                if (!drunk && !rolling) return;
                if (cam == null || cam != Game.Cam) return;
                _tilted = cam;
                _savedRot = cam.transform.localRotation;
                _savedFov = cam.fieldOfView;
                float roll = 0, pitch = 0;
                if (drunk)
                {
                    roll += Mathf.Sin(now * 1.3f) * 14f;
                    pitch += Mathf.Sin(now * 0.9f + 1f) * 5f;
                    cam.fieldOfView = _savedFov + Mathf.Sin(now * 1.7f) * 6f;
                }
                if (rolling) roll += (now - _rollStart) / (_rollEnd - _rollStart) * 360f * _rollTurns;
                cam.transform.localRotation = _savedRot * Quaternion.Euler(pitch, 0, roll);
            }
            catch { }
        }

        internal static void AfterCameraRender(Camera cam)
        {
            if (_tilted == null || cam != _tilted) return;
            cam.transform.localRotation = _savedRot;
            cam.fieldOfView = _savedFov;
            _tilted = null;
        }

        // ================= small helpers =================
        static double Clamp(double v, double lo, double hi) => double.IsNaN(v) ? lo : Math.Max(lo, Math.Min(hi, v));
        static float Extend(float until, double seconds) => Mathf.Max(until, Time.time) + (float)seconds;
        static string Left(float until) => Mathf.CeilToInt(Mathf.Max(0, until - Time.time)) + "s";

        internal static void Fail(string what, Exception e)
        {
            if (_fails++ > 30) return; // never flood the log from a per-frame error
            var inner = e is System.Reflection.TargetInvocationException && e.InnerException != null ? e.InnerException : e;
            Plugin.Say("Effect '" + what + "' failed: " + inner.Message);
            Plugin.L.LogError(inner.ToString());
        }
    }
}
