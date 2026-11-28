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
        const float Life = 3.5f, SlideIn = 0.25f, FadeOut = 0.5f;
        const int MaxShown = 5;
        static readonly ConcurrentQueue<byte[]> Waiting = new ConcurrentQueue<byte[]>();
        static readonly Stopwatch Clock = Stopwatch.StartNew();
        static float Now => (float)Clock.Elapsed.TotalSeconds;
        class Pop { public GameObject Go; public RectTransform Rect; public RawImage Img; public Texture2D Tex; public float Born; }
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
            if (end < 0 || Waiting.Count > 20) return;
            Waiting.Enqueue(Convert.FromBase64String(json.Substring(i, end - i)));
        }

        // Main thread, every frame.
        internal static void Apply()
        {
            try
            {
                while (Shown.Count < MaxShown && Waiting.TryDequeue(out var png)) Add(png);
                if (Shown.Count == 0) return;
                var h = Screen.height * 0.085f;
                var w = h * 620f / 150f;
                var now = Now;
                for (int n = Shown.Count - 1; n >= 0; n--)
                {
                    var p = Shown[n];
                    if (now - p.Born >= Life) { UnityEngine.Object.Destroy(p.Go); UnityEngine.Object.Destroy(p.Tex); Shown.RemoveAt(n); }
                }
                for (int n = 0; n < Shown.Count; n++)
                {
                    var p = Shown[n];
                    var age = now - p.Born;
                    var slide = Mathf.Clamp01(age / SlideIn);
                    slide = 1f - (1f - slide) * (1f - slide); // ease out
                    var target = -(Screen.height * 0.03f + n * (h + 8f));
                    p.Rect.sizeDelta = ResetBox.V2(w, h);
                    p.Rect.anchoredPosition = ResetBox.V2(0f, Mathf.Lerp(h, target, slide));
                    var c = default(Color); c.r = 1f; c.g = 1f; c.b = 1f;
                    c.a = Mathf.Clamp01((Life - age) / FadeOut);
                    p.Img.color = c;
                }
            }
            catch (Exception e)
            {
                if (_fails++ < 3) Plugin.Say("A popup could not be shown: " + e.GetType().Name + ": " + e.Message);
            }
        }

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
