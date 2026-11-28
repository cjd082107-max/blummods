using System;
using UnityEngine;
using UnityEngine.UI;

namespace BlumMods.ShredABillion
{
    // The reset timer box. The BlumMods app runs the countdown and draws the box; this only shows the
    // picture it sends, centred on the screen on a top-most UI canvas, until the app says to hide it.
    internal static class ResetBox
    {
        static readonly object Lock = new object();
        static byte[] _next;
        static bool _hide;
        static GameObject _root, _box;
        static RawImage _image;
        static RectTransform _rect;
        static Texture2D _tex;
        static int _fails;

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

        // Main thread, every frame (from the player's Update).
        internal static void Apply()
        {
            byte[] next; bool hide;
            lock (Lock) { next = _next; hide = _hide; _next = null; _hide = false; }
            if (next == null && !hide) return;
            try
            {
                if (hide && _box != null) _box.SetActive(false);
                if (next == null) return;
                Ensure();
                if (!ImageConversion.LoadImage(_tex, next)) return;
                _image.texture = _tex;
                var h = Screen.height * 0.55f;
                _rect.sizeDelta = V2(h, h); // the app draws a square box
                _box.SetActive(true);
            }
            catch (Exception e)
            {
                if (_fails++ < 3) Plugin.Say("The reset timer box could not be shown: " + e.GetType().Name + ": " + e.Message);
            }
        }

        // One top-most screen canvas holds the reset box and the drop-down popups.
        internal static GameObject Root()
        {
            if (_root != null) return _root;
            _root = new GameObject("BlumMods Overlay");
            UnityEngine.Object.DontDestroyOnLoad(_root);
            var canvas = _root.AddComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 32000; // above the game's own UI
            return _root;
        }

        static void Ensure()
        {
            if (_box != null && _image != null) return;
            Root();
            var box = new GameObject("Box");
            _box = box;
            box.transform.SetParent(_root.transform, false);
            _image = box.AddComponent<RawImage>();
            _image.raycastTarget = false; // never blocks his clicks
            _rect = box.GetComponent<RectTransform>();
            var mid = V2(0.5f, 0.5f);
            _rect.anchorMin = mid; _rect.anchorMax = mid; _rect.pivot = mid;
            _rect.anchoredPosition = V2(0f, 0f);
            _tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
        }

        internal static Vector2 V2(float x, float y) { var v = default(Vector2); v.x = x; v.y = y; return v; }
    }
}
