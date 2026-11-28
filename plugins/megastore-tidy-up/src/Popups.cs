using System;
using System.Collections.Concurrent;
using System.Collections.Generic;
using UnityEngine;

namespace BlumMods.MegastoreTidyUp
{
    // Drop-down popups (e.g. "+25 SORTED" with the viewer's name). The app draws each one as a picture;
    // this stacks them at the top middle of the screen, slides them in and fades them out.
    internal static class Popups
    {
        // At most 4 on screen. When more come in, the oldest goes at once and the next rotates in,
        // one every Gap seconds, instead of each waiting out its full time (Carter, 2026-11-27).
        const float Life = 3.5f, SlideIn = 0.2f, FadeOut = 0.5f, Gap = 0.12f;
        const int MaxShown = 4;
        static float _nextAdd, _last;
        static readonly ConcurrentQueue<byte[]> Waiting = new ConcurrentQueue<byte[]>();
        class Pop { public Texture2D Tex; public float Born; public float Y = float.NaN; }
        static readonly List<Pop> Shown = new List<Pop>();

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
            var now = Time.unscaledTime;
            var dt = Mathf.Clamp01(now - _last); _last = now;
            if (now >= _nextAdd && Waiting.TryDequeue(out var png))
            {
                var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
                if (tex.LoadImage(png))
                {
                    if (Shown.Count >= MaxShown) Drop(0);
                    Shown.Add(new Pop { Tex = tex, Born = now });
                }
                else UnityEngine.Object.Destroy(tex);
                _nextAdd = now + Gap;
            }
            for (int n = Shown.Count - 1; n >= 0; n--)
                if (now - Shown[n].Born >= Life) Drop(n);
            var h = Screen.height * 0.085f;
            var follow = Mathf.Clamp01(dt * 18f);
            for (int n = 0; n < Shown.Count; n++)
            {
                var target = Screen.height * 0.03f + n * (h + 8f);
                if (float.IsNaN(Shown[n].Y)) Shown[n].Y = target - h * 0.6f;
                Shown[n].Y = Mathf.Lerp(Shown[n].Y, target, follow);
            }
        }

        static void Drop(int n) { UnityEngine.Object.Destroy(Shown[n].Tex); Shown.RemoveAt(n); }


        internal static void Draw()
        {
            if (Shown.Count == 0) return;
            GUI.depth = -1000;
            var h = Screen.height * 0.085f;
            var w = h * 620f / 150f;
            var old = GUI.color;
            for (int n = 0; n < Shown.Count; n++)
            {
                var age = Time.unscaledTime - Shown[n].Born;
                GUI.color = new Color(1f, 1f, 1f, Mathf.Min(Mathf.Clamp01(age / SlideIn), Mathf.Clamp01((Life - age) / FadeOut)));
                GUI.DrawTexture(new Rect((Screen.width - w) / 2f, Shown[n].Y, w, h), Shown[n].Tex, ScaleMode.ScaleToFit, true);
            }
            GUI.color = old;
        }
    }
}
