// Signatures only, checked against SHRED A BILLION's interop UnityEngine.UI (2026-11-27).
using System;
namespace UnityEngine.EventSystems
{
    public class UIBehaviour : MonoBehaviour { public UIBehaviour(IntPtr pointer) : base(pointer) { } }
}
namespace UnityEngine.UI
{
    public class Graphic : UnityEngine.EventSystems.UIBehaviour
    {
        public Graphic(IntPtr pointer) : base(pointer) { }
        public bool raycastTarget { set => throw null; }
    }
    public class MaskableGraphic : Graphic { public MaskableGraphic(IntPtr pointer) : base(pointer) { } }
    public class RawImage : MaskableGraphic
    {
        public RawImage(IntPtr pointer) : base(pointer) { }
        public Texture texture { set => throw null; }
    }
}
