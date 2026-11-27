using System;
using Il2CppInterop.Runtime.InteropTypes;
using UnityEngine;
namespace Game.Stream
{
    public class StreamActions : Il2CppObjectBase
    {
        public StreamActions(IntPtr pointer) : base(pointer) { }
        public string Launch(float power) => throw null;
        public void FullReset() => throw null;
    }
    public class StreamSystem : MonoBehaviour
    {
        public StreamSystem(IntPtr pointer) : base(pointer) { }
        public static StreamSystem Instance => throw null;
        public StreamActions _actions { get => throw null; set => throw null; }
    }
}
