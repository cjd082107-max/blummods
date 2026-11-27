using System;
using System.Collections.Generic;
using System.Reflection;
using HarmonyLib;
using UnityEngine;

namespace BlumMods.MegastoreTidyUp
{
    // Reaches into the game's own code by name (Assembly-CSharp is never referenced, so no game files are shipped).
    // Names were read from the game's Assembly-CSharp.dll on 2026-11-26 (Unity 6000.0.73f1).
    internal static class Game
    {
        internal static readonly Type PlayerMoveT = AccessTools.TypeByName("PlayerMove");
        internal static readonly Type PlayerLookT = AccessTools.TypeByName("PlayerLook");
        internal static readonly Type ProductT = AccessTools.TypeByName("Product");
        internal static readonly Type SkillServiceT = AccessTools.TypeByName("SkillService");
        internal static readonly Type XpSourceT = AccessTools.TypeByName("XpSource");

        static Component _player;

        // The local player's movement script (a singleton in the game).
        internal static Component Player
        {
            get
            {
                if (_player != null) return _player;
                if (PlayerMoveT == null) return null;
                _player = Singleton(PlayerMoveT) ?? (UnityEngine.Object.FindObjectOfType(PlayerMoveT) as Component);
                return _player;
            }
        }

        internal static Component Singleton(Type t)
        {
            if (t == null) return null;
            try { return AccessTools.Property(t, "Instance")?.GetValue(null, null) as Component; } catch { return null; }
        }

        internal static T Get<T>(object obj, string field, T fallback = default)
        {
            if (obj == null) return fallback;
            try
            {
                var f = AccessTools.Field(obj.GetType(), field);
                if (f != null) return (T)f.GetValue(obj);
                var p = AccessTools.Property(obj.GetType(), field);
                if (p != null) return (T)p.GetValue(obj, null);
            }
            catch { }
            return fallback;
        }

        internal static bool Set(object obj, string field, object value)
        {
            if (obj == null) return false;
            try
            {
                var f = AccessTools.Field(obj.GetType(), field);
                if (f == null) return false;
                f.SetValue(obj, value);
                return true;
            }
            catch { return false; }
        }

        internal static object Call(object obj, string method, params object[] args)
        {
            if (obj == null) return null;
            var m = AccessTools.Method(obj.GetType(), method);
            if (m == null) throw new MissingMethodException(obj.GetType().Name, method);
            return m.Invoke(obj, args);
        }

        internal static Rigidbody PlayerBody => Get<Rigidbody>(Player, "rigidBody") ?? Player?.GetComponent<Rigidbody>();

        // Where his feet are.
        internal static Vector3 Feet
        {
            get
            {
                var bottom = Get<Transform>(Player, "playerBottom");
                if (bottom != null) return bottom.position;
                return Player != null ? Player.transform.position : Vector3.zero;
            }
        }

        internal static Camera Cam
        {
            get
            {
                var look = Singleton(PlayerLookT);
                var cam = Get<Camera>(look, "MainCamera");
                return cam != null ? cam : Camera.main;
            }
        }

        internal static void Teleport(Vector3 pos)
        {
            try { Call(Player, "TeleportTo", pos, Player.transform.rotation); }
            catch { if (Player != null) Player.transform.position = pos; }
        }

        // Every product in the scene. Stored = sitting on a shelf; those are never touched.
        internal static List<Component> LooseProducts(Vector3 near, float radius, int max)
        {
            var list = new List<Component>();
            if (ProductT == null) return list;
            var all = UnityEngine.Object.FindObjectsOfType(ProductT);
            var playerRoot = Player != null ? Player.transform.root : null;
            var r2 = radius * radius;
            var stored = AccessTools.Property(ProductT, "Stored");
            foreach (var o in all)
            {
                var p = o as Component;
                if (p == null || !p.gameObject.activeInHierarchy) continue;
                if ((p.transform.position - near).sqrMagnitude > r2) continue;
                if (playerRoot != null && p.transform.root == playerRoot) continue; // in his hands
                bool onShelf = true;                                                // unsure = leave it alone
                try { if (stored != null) onShelf = (bool)stored.GetValue(p, null); } catch { }
                if (onShelf) continue;                                              // on a shelf: never undo his sorting
                list.Add(p);
                if (list.Count >= max) break;
            }
            return list;
        }

        // Lets a product fly with the given velocity, through the game's own method when it has one.
        internal static void Fling(Component product, Vector3 velocity)
        {
            try { Call(product, "ForceDynamicNetworked", velocity); return; } catch { }
            var rb = Get<Rigidbody>(product, "RigidBody") ?? product.GetComponent<Rigidbody>();
            if (rb == null) return;
            rb.isKinematic = false;
            rb.linearVelocity = velocity;
        }

        internal static object EnumValue(Type t, string name)
        {
            try { return t != null ? Enum.Parse(t, name) : null; } catch { return null; }
        }
    }
}
