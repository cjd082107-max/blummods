using System;
using UnityEngine;
namespace Game.Player
{
    public class PlayerController : MonoBehaviour
    {
        public PlayerController(IntPtr pointer) : base(pointer) { }
        public Transform Root => throw null;
        public Vector3 Position => throw null;
        public bool InputLocked { get => throw null; set => throw null; }
        public void Teleport(Vector3 position, Quaternion rotation) => throw null;
        public void Respawn() => throw null;
        public void Update() => throw null;
    }
}
