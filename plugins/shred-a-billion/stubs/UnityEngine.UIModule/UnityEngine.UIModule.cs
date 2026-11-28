// Signatures only, checked against SHRED A BILLION's interop UnityEngine.UIModule (2026-11-27).
using System;
namespace UnityEngine
{
    public enum RenderMode { ScreenSpaceOverlay = 0, ScreenSpaceCamera = 1, WorldSpace = 2 }
    public class Canvas : Behaviour
    {
        public Canvas(IntPtr pointer) : base(pointer) { }
        public RenderMode renderMode { set => throw null; }
        public int sortingOrder { set => throw null; }
    }
}
