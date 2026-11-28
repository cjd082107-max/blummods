using System;
using UnityEngine;

namespace BlumMods.MegastoreTidyUp
{
    // The reset timer box. The BlumMods app runs the countdown and draws the box; this only shows the
    // picture it sends, centred on the screen, until the app says to hide it.
    internal static class ResetBox
    {
        static readonly object Lock = new object();
        static byte[] _next;
        static bool _hide;
        static Texture2D _tex;
        static bool _visible;

        // Bridge thread. Message: {"type":"resetbox","png":"<base64>"} or {"type":"resetbox","hide":true}
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
            catch (Exception e) { Plugin.L.LogWarning("Reset box message was not readable: " + e.Message); }
        }

        // Main thread, every frame.
        internal static void Apply()
        {
            byte[] next; bool hide;
            lock (Lock) { next = _next; hide = _hide; _next = null; _hide = false; }
            if (hide) _visible = false;
            if (next == null) return;
            if (_tex == null) { _tex = new Texture2D(2, 2, TextureFormat.RGBA32, false); _tex.hideFlags = HideFlags.HideAndDontSave; }
            if (_tex.LoadImage(next)) _visible = true;
        }

        internal static void Draw()
        {
            if (!_visible || _tex == null) return;
            GUI.depth = -1000;
            var h = Screen.height * 0.55f;
            var w = h * _tex.width / Mathf.Max(1, _tex.height);
            GUI.DrawTexture(new Rect((Screen.width - w) / 2f, (Screen.height - h) / 2f, w, h), _tex, ScaleMode.ScaleToFit, true);
        }
    }
}
