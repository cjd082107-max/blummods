using System;
using UnityEngine;

namespace BlumMods.MegastoreTidyUp
{
    // The jail timer (Carter, 2026-11-28: "so I know when I'm gonna get out"). Effects tells the app the seconds
    // left once a second; the app draws the box and sends it back; this shows it at the bottom middle of the screen.
    internal static class JailBox
    {
        static readonly object Lock = new object();
        static byte[] _next;
        static bool _hide;
        static Texture2D _tex;
        static bool _visible;

        // Bridge thread. Message: {"type":"jailbox","png":"<base64>"} or {"type":"jailbox","hide":true}
        internal static void Receive(string json)
        {
            try
            {
                if (json.Contains("\"hide\":true")) { lock (Lock) { _hide = true; _next = null; } return; }
                const string key = "\"png\":\"";
                var i = json.IndexOf(key, StringComparison.Ordinal);
                if (i < 0) return;
                i += key.Length;
                var end = json.IndexOf('"', i);
                if (end < 0) return;
                var bytes = Convert.FromBase64String(json.Substring(i, end - i));
                lock (Lock) { _next = bytes; _hide = false; }
            }
            catch (Exception e) { Plugin.L.LogWarning("Jail timer message was not readable: " + e.Message); }
        }

        // Main thread, every frame. Jailed = whether the mod still has him in jail (hides a box left over from a lost message).
        internal static void Apply(bool jailed)
        {
            byte[] next; bool hide;
            lock (Lock) { next = _next; hide = _hide; _next = null; _hide = false; }
            if (!jailed || hide) _visible = false;
            if (!jailed || next == null) return;
            if (_tex == null) { _tex = new Texture2D(2, 2, TextureFormat.RGBA32, false); _tex.hideFlags = HideFlags.HideAndDontSave; }
            if (_tex.LoadImage(next)) _visible = true;
        }

        internal static void Draw()
        {
            if (!_visible || _tex == null) return;
            GUI.depth = -1000;
            var h = Screen.height * 0.12f;
            var w = h * _tex.width / Mathf.Max(1, _tex.height);
            GUI.DrawTexture(new Rect((Screen.width - w) / 2f, Screen.height * 0.9f - h, w, h), _tex, ScaleMode.ScaleToFit, true);
        }
    }
}
