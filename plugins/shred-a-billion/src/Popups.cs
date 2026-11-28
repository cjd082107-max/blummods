using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using System.Diagnostics;
using UnityEngine;
using UnityEngine.UI;

namespace BlumMods.ShredABillion
{
    // Drop-down popups ("-$25,000 CASH" with the viewer's name). The app draws each one as a picture;
    // this stacks them at the top middle of the screen, slides them in and fades them out.
    internal static class Popups
    {
        // At most 4 on screen. When more come in (40 Roses), the oldest goes at once and the next rotates in,
        // one every Gap seconds, instead of each waiting out its full time (Carter, 2026-11-27).
        const float Life = 3.5f, SlideIn = 0.2f, FadeOut = 0.5f, Gap = 0.12f;
        const int MaxShown = 4;
        static float _nextAdd, _last;
        static readonly ConcurrentQueue<byte[]> Waiting = new ConcurrentQueue<byte[]>();
        static readonly Stopwatch Clock = Stopwatch.StartNew();
        static float Now => (float)Clock.Elapsed.TotalSeconds;
        class Pop { public GameObject Go; public RectTransform Rect; public RawImage Img; public Texture2D Tex; public float Born; public float Y = float.NaN; }
        static readonly List<Pop> Shown = new List<Pop>();
        static int _fails;

        // Bridge thread. Message: {"type":"popup","png":"<base64>"}
        internal static void Receive(string json)
        {
            const string key = "\"png\":\"";
            var i = json.IndexOf(key, StringComparison.Ordinal);
            if (i < 0) return;
            i += key.Length;
            var end = json.IndexOf('"', i);
            if (end < 0 || Waiting.Count > 60) return;
            Waiting.Enqueue(Convert.FromBase64String(json.Substring(i, end - i)));
        }

        // Main thread, every frame.
        internal static void Apply()
        {
            try
            {
                var now = Now;
                var dt = Mathf.Clamp01(now - _last); _last = now;
                if (now >= _nextAdd && Waiting.TryDequeue(out var png))
                {
                    if (Shown.Count >= MaxShown) { Drop(0); }
                    Add(png);
                    _nextAdd = now + Gap;
                }
                for (int n = Shown.Count - 1; n >= 0; n--)
                    if (now - Shown[n].Born >= Life) Drop(n);
                if (Shown.Count == 0) return;
                var h = Screen.height * 0.085f;
                var w = h * 620f / 150f;
                var follow = Mathf.Clamp01(dt * 18f);
                for (int n = 0; n < Shown.Count; n++)
                {
                    var p = Shown[n];
                    var age = now - p.Born;
                    var target = -(Screen.height * 0.03f + n * (h + 8f));
                    if (float.IsNaN(p.Y)) p.Y = target + h * 0.6f; // a new one drops in from just above its slot
                    p.Y = Mathf.Lerp(p.Y, target, follow);           // the rest glide up when the top one goes
                    p.Rect.sizeDelta = ResetBox.V2(w, h);
                    p.Rect.anchoredPosition = ResetBox.V2(0f, p.Y);
                    var c = default(Color); c.r = 1f; c.g = 1f; c.b = 1f;
                    c.a = Mathf.Clamp01(age / SlideIn);
                    var fade = Mathf.Clamp01((Life - age) / FadeOut);
                    if (fade < c.a) c.a = fade;
                    p.Img.color = c;
                }
            }
            catch (Exception e)
            {
                if (_fails++ < 3) Plugin.Say("A popup could not be shown: " + e.GetType().Name + ": " + e.Message);
            }
        }

        static void Drop(int n) { UnityEngine.Object.Destroy(Shown[n].Go); UnityEngine.Object.Destroy(Shown[n].Tex); Shown.RemoveAt(n); }

        static void Add(byte[] png)
        {
            var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false);
            if (!ImageConversion.LoadImage(tex, png)) { UnityEngine.Object.Destroy(tex); return; }
            var go = new GameObject("BlumMods Popup");
            go.transform.SetParent(ResetBox.Root().transform, false);
            var img = go.AddComponent<RawImage>();
            img.raycastTarget = false;
            img.texture = tex;
            var rect = go.GetComponent<RectTransform>();
            var top = ResetBox.V2(0.5f, 1f);
            rect.anchorMin = top; rect.anchorMax = top; rect.pivot = top;
            Shown.Add(new Pop { Go = go, Rect = rect, Img = img, Tex = tex, Born = Now });
        }
    }
}
