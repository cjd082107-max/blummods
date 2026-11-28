using System;
using UnityEngine;
using UnityEngine.UI;

namespace BlumMods.ShredABillion
{
    // The jail timer (Carter, 2026-11-28: "so I know when I'm gonna get out"). Effects tells the app the seconds
    // left once a second; the app draws the box and sends it back; this shows it at the bottom middle of the screen.
    internal static class JailBox
    {
        static readonly object Lock = new object();
        static byte[] _next;
        static bool _hide;
        static GameObject _box;
        static RawImage _image;
        static RectTransform _rect;
        static Texture2D _tex;
        static int _fails;
        static bool _shown;

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
            if (!jailed) { if (_shown) { _box.SetActive(false); _shown = false; } return; }
            if (next == null && !hide) return;
            try
            {
                if (hide && _box != null) { _box.SetActive(false); _shown = false; }
                if (next == null) return;
                Ensure();
                if (!ImageConversion.LoadImage(_tex, next)) return;
                _image.texture = _tex;
                var h = Screen.height * 0.12f;
                _rect.sizeDelta = ResetBox.V2(h * 520f / 170f, h); // the app draws a 520 x 170 box
                _rect.anchoredPosition = ResetBox.V2(0f, Screen.height * 0.1f);
                _box.SetActive(true); _shown = true;
            }
            catch (Exception e)
            {
                if (_fails++ < 3) Plugin.Say("The jail timer could not be shown: " + e.GetType().Name + ": " + e.Message);
            }
        }

        static void Ensure()
        {
            if (_box != null && _image != null) return;
            var root = ResetBox.Root();
            _box = new GameObject("Jail timer");
            _box.transform.SetParent(root.transform, false);
            _image = _box.AddComponent<RawImage>();
            _image.raycastTarget = false; // never blocks his clicks
            _rect = _box.GetComponent<RectTransform>();
            var bottom = ResetBox.V2(0.5f, 0f);
            _rect.anchorMin = bottom; _rect.anchorMax = bottom; _rect.pivot = bottom;
            _tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        }
    }
}
