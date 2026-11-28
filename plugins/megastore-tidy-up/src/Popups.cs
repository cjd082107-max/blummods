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
        const float Life = 3.5f, SlideIn = 0.25f, FadeOut = 0.5f;
        const int MaxShown = 5;
        static readonly ConcurrentQueue<byte[]> Waiting = new ConcurrentQueue<byte[]>();
        class Pop { public Texture2D Tex; public float Born; }
        static readonly List<Pop> Shown = new List<Pop>();

        // Bridge thread. Message: {"type":"popup","png":"<base64>"}
        internal static void Receive(string json)
        {
            const string key = "\"png\":\"";
            var i = json.IndexOf(key, StringComparison.Ordinal);
            if (i < 0) return;
            i += key.Length;
            var end = json.IndexOf('"', i);
            if (end < 0 || Waiting.Count > 20) return;
            Waiting.Enqueue(Convert.FromBase64String(json.Substring(i, end - i)));
        }

        // Main thread, every frame.
        internal static void Apply()
        {
            while (Shown.Count < MaxShown && Waiting.TryDequeue(out var png))
            {
                var tex = new Texture2D(2, 2, TextureFormat.RGBA32, false) { hideFlags = HideFlags.HideAndDontSave };
                if (tex.LoadImage(png)) Shown.Add(new Pop { Tex = tex, Born = Time.unscaledTime });
                else UnityEngine.Object.Destroy(tex);
            }
            for (int n = Shown.Count - 1; n >= 0; n--)
                if (Time.unscaledTime - Shown[n].Born >= Life) { UnityEngine.Object.Destroy(Shown[n].Tex); Shown.RemoveAt(n); }
        }

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
                var slide = Mathf.Clamp01(age / SlideIn);
                slide = 1f - (1f - slide) * (1f - slide);
                var y = Mathf.Lerp(-h, Screen.height * 0.03f + n * (h + 8f), slide);
                GUI.color = new Color(1f, 1f, 1f, Mathf.Clamp01((Life - age) / FadeOut));
                GUI.DrawTexture(new Rect((Screen.width - w) / 2f, y, w, h), Shown[n].Tex, ScaleMode.ScaleToFit, true);
            }
            GUI.color = old;
        }
    }
}
