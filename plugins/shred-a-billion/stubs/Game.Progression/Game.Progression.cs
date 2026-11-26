using System;
using Game.Core;
using UnityEngine;
namespace Game.Progression
{
    public class EconomyService : MonoBehaviour
    {
        public EconomyService(IntPtr pointer) : base(pointer) { }
        public double Dollars => throw null;
        public bool TrySpend(double cost) => throw null;
        public void Add(double amount, IncomeSource source) => throw null;
        public void Awake() => throw null;
    }
}
