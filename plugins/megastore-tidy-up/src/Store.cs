using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Reflection;
using HarmonyLib;
using UnityEngine;
using UnityEngine.SceneManagement;

namespace BlumMods.MegastoreTidyUp
{
    // The win item (products to sort) and store resets, done through the game's own code paths.
    // Read from the game with Mono.Cecil on 2026-11-27:
    //  - Sorting one product = what the Pair Up skill does (PairUpRuntime.PlaceOnShelf):
    //      ProductManager.SetProductOrganized(key, by); Shelf.PlaceProduct(product, false, false);
    //      StatsRecorder.OnProductPlaced(shelf, product, true, by, false, false)
    //    The right shelf (PairShelfFinder.CollectCandidates): the placeable's ProductSubGroup == data.productSubGroup,
    //    shelf.IsSupported(data.shelfType), shelf.ContainedType == data.type or the shelf is empty, and room left.
    //  - Unsorting: Shelf.RemoveProduct(product) (fires the game's own removed events) + ProductManager.UnsetProductOrganized.
    //  - Reset store = the menu's Reset Store button: DataSerializer.ResetLevel(level) + PlayerStats.ResetSession(id),
    //    then the Start button (LevelSelectionWindow.currentSelection + OnStartButtonClicked).
    internal static class Store
    {
        static readonly Type ShelfT = AccessTools.TypeByName("Shelf");
        static readonly Type SpawnT = AccessTools.TypeByName("SpawnManager");
        static readonly Type ProductMgrT = AccessTools.TypeByName("ProductManager");
        static readonly Type StatsT = AccessTools.TypeByName("StatsRecorder");
        static readonly Type CoopT = AccessTools.TypeByName("CoopSessionInfo");
        static readonly Type SerializerT = AccessTools.TypeByName("ToolBox.Serialization.DataSerializer");
        static readonly Type PlayerStatsT = AccessTools.TypeByName("PlayerStats");
        static readonly Type TeardownT = AccessTools.TypeByName("SessionTeardown");
        static readonly Type LevelWindowT = AccessTools.TypeByName("LevelSelectionWindow");

        // Big amounts are worked off a few per frame so one huge gift can't freeze the game.
        static readonly Queue<Component> _toSort = new Queue<Component>();
        static readonly Queue<Component> _toUnsort = new Queue<Component>();
        static string _sortWho, _unsortWho;
        static int _sorted, _unsorted, _sortMissed;
        internal static bool Busy;

        static ulong Me { get { try { return (ulong)AccessTools.PropertyGetter(CoopT, "LocalSteamId").Invoke(null, null); } catch { return 0; } } }

        // ---------- sort N loose products onto their right shelves (helps) ----------
        internal static void QueueTidy(string who, long amount)
        {
            var loose = Game.LooseProducts(Game.Feet, 100000f, (int)Math.Min(amount, 200000));
            loose.Sort((a, b) => (a.transform.position - Game.Feet).sqrMagnitude.CompareTo((b.transform.position - Game.Feet).sqrMagnitude));
            foreach (var p in loose) _toSort.Enqueue(p);
            _sortWho = who; _sorted = 0; _sortMissed = 0;
            Plugin.Say(loose.Count > 0 ? who + " is tidying " + loose.Count + " items onto their shelves…" : who + " sent Tidy, but there's nothing loose left to sort.");
        }

        // ---------- knock N sorted products off their shelves (hurts) ----------
        internal static void QueueMess(string who, long amount)
        {
            var list = new List<Component>();
            foreach (var o in UnityEngine.Object.FindObjectsOfType(Game.ProductT))
            {
                var p = o as Component;
                if (p == null || !Game.Get(p, "Stored", false) || Game.Get<object>(p, "BelongingShelf") == null) continue;
                list.Add(p);
            }
            list.Sort((a, b) => (a.transform.position - Game.Feet).sqrMagnitude.CompareTo((b.transform.position - Game.Feet).sqrMagnitude));
            int n = (int)Math.Min(amount, list.Count);
            for (int i = 0; i < n; i++) _toUnsort.Enqueue(list[i]);
            _unsortWho = who; _unsorted = 0;
            Plugin.Say(n > 0 ? who + " is knocking " + n + " sorted items off the shelves!" : who + " sent Mess up, but nothing is on the shelves yet.");
        }

        internal static void Tick()
        {
            for (int i = 0; i < 25 && _toSort.Count > 0; i++)
            {
                var p = _toSort.Dequeue();
                if (p == null || Game.Get(p, "Stored", true)) continue;
                if (SortOne(p)) _sorted++; else _sortMissed++;
                if (_toSort.Count == 0) Plugin.Say(_sortWho + " tidied " + _sorted + " items" + (_sortMissed > 0 ? " (" + _sortMissed + " had no free shelf)" : "") + ".");
            }
            for (int i = 0; i < 25 && _toUnsort.Count > 0; i++)
            {
                var p = _toUnsort.Dequeue();
                if (p != null && UnsortOne(p)) _unsorted++;
                if (_toUnsort.Count == 0) Plugin.Say(_unsortWho + " knocked " + _unsorted + " items off the shelves. Back to sorting!");
            }
        }

        static bool SortOne(Component product)
        {
            var data = Game.Get<object>(product, "Data");
            if (data == null) return false;
            var shelf = FindShelf(data, product.transform.position);
            if (shelf == null) return false;
            var by = Me;
            var key = Game.Call(product, "GetProductKey");
            var mgr = Game.Singleton(ProductMgrT);
            try { AccessTools.Method(ProductMgrT, "SetProductOrganized").Invoke(mgr, new[] { key, (object)by }); } catch { }
            AccessTools.Method(ShelfT, "PlaceProduct", new[] { Game.ProductT, typeof(bool), typeof(bool) }).Invoke(shelf, new object[] { product, false, false });
            try
            {
                var stats = UnityEngine.Object.FindObjectOfType(StatsT);
                AccessTools.Method(StatsT, "OnProductPlaced").Invoke(stats, new object[] { shelf, product, true, by, false, false });
            }
            catch (Exception e) { Plugin.L.LogWarning("Stats for a tidied item failed: " + e.Message); }
            return true;
        }

        static object FindShelf(object data, Vector3 near)
        {
            var spawn = Game.Singleton(SpawnT);
            var placeables = Game.Get<IList>(spawn, "Placeables");
            if (placeables == null) return null;
            var subGroup = Game.Get<object>(data, "productSubGroup");
            var shelfType = Game.Get<object>(data, "shelfType");
            var type = Game.Get<object>(data, "type");
            object best = null; float bestD = float.MaxValue;
            foreach (var pl in placeables)
            {
                if (pl == null || !Equals(Game.Get<object>(pl, "ProductSubGroup"), subGroup)) continue;
                var shelves = Game.Get<IList>(pl, "Shelves");
                if (shelves == null) continue;
                foreach (var s in shelves)
                {
                    if (s == null) continue;
                    if (!(bool)Game.Call(s, "IsSupported", shelfType)) continue;
                    var count = (int)Game.Call(s, "GetProductCount");
                    if (count > 0 && !Equals(Game.Get<object>(s, "ContainedType"), type)) continue;
                    if ((int)Game.Call(s, "GetCapacityForProduct", data) <= count) continue;
                    var d = (((Component)s).transform.position - near).sqrMagnitude;
                    if (d < bestD) { bestD = d; best = s; }
                }
            }
            return best;
        }

        static bool UnsortOne(Component product)
        {
            var shelf = Game.Get<object>(product, "BelongingShelf");
            if (shelf == null) return false;
            var key = Game.Call(product, "GetProductKey");
            Game.Call(shelf, "RemoveProduct", product);
            try
            {
                var mgr = Game.Singleton(ProductMgrT);
                var args = new object[] { key, 0UL };
                if ((bool)AccessTools.Method(ProductMgrT, "TryGetOrganizer").Invoke(mgr, args))
                    AccessTools.Method(ProductMgrT, "UnsetProductOrganized").Invoke(mgr, new[] { key, args[1] });
            }
            catch (Exception e) { Plugin.L.LogWarning("Unsorting bookkeeping failed: " + e.Message); }
            product.transform.SetParent(null, true);
            var r = UnityEngine.Random.insideUnitCircle * 2.5f;
            Game.Fling(product, new Vector3(r.x, 3.5f, r.y));
            return true;
        }

        // ---------- resets (every one backs the save up first) ----------
        internal static string Backup(bool everything, int levelId)
        {
            var dir = Application.persistentDataPath;
            var dest = Path.Combine(dir, "BlumMods backups", DateTime.Now.ToString("yyyy-MM-dd HH-mm-ss"));
            Directory.CreateDirectory(dest);
            var pattern = everything ? "*.data" : "Level_" + levelId + "_Progress*.data";
            foreach (var f in Directory.GetFiles(dir, pattern)) File.Copy(f, Path.Combine(dest, Path.GetFileName(f)), true);
            return dest;
        }

        static object CurrentLevel => AccessTools.PropertyGetter(SerializerT, "CurrentLevel").Invoke(null, null);
        static int VanillaId(object level) { try { return (int)AccessTools.PropertyGetter(level.GetType(), "VanillaId").Invoke(level, null); } catch { return -1; } }

        // whole = false: this store starts over and reloads. whole = true: every store's progress is wiped, back to the menu.
        internal static IEnumerator Reset(string who, bool whole)
        {
            Busy = true;
            object level = null; int id = -1;
            try { level = CurrentLevel; id = VanillaId(level); } catch (Exception e) { Plugin.Say("Couldn't tell which store is open: " + e.Message); Busy = false; yield break; }
            try { Backup(whole, id); } catch (Exception e) { Plugin.Say("Couldn't back up the save, so nothing was reset: " + e.Message); Busy = false; yield break; }
            Plugin.Say(who + (whole ? " wiped the whole save!" : " reset the store!") + " (Save backed up first.) Reloading…");
            AccessTools.Method(TeardownT, "ReturnToMenu").Invoke(null, new object[] { null });
            var menu = (string)AccessTools.Field(TeardownT, "MENU_SCENE").GetValue(null);
            var until = Time.realtimeSinceStartup + 60f;
            while (SceneManager.GetActiveScene().name != menu && Time.realtimeSinceStartup < until) yield return null;
            yield return new WaitForSecondsRealtime(2.5f);
            try
            {
                if (whole)
                {
                    for (int lvl = 0; lvl < 50; lvl++)
                        if (File.Exists(Path.Combine(Application.persistentDataPath, "Level_" + lvl + "_Progress.data")))
                        {
                            AccessTools.Method(SerializerT, "ResetLevel", new[] { typeof(int) }).Invoke(null, new object[] { lvl });
                            try { AccessTools.Method(PlayerStatsT, "ResetSession").Invoke(null, new object[] { lvl }); } catch { }
                        }
                    Plugin.Say("Every store is back to brand new. Pick a store to start again.");
                }
                else
                {
                    AccessTools.Method(SerializerT, "ResetLevel", new[] { level.GetType() }).Invoke(null, new[] { level });
                    if (id >= 0) try { AccessTools.Method(PlayerStatsT, "ResetSession").Invoke(null, new object[] { id }); } catch { }
                    var win = Resources.FindObjectsOfTypeAll(LevelWindowT);
                    if (win.Length == 0) { Plugin.Say("The store was reset. Press Start in the menu to play it again."); }
                    else
                    {
                        AccessTools.Field(LevelWindowT, "currentSelection").SetValue(win[0], level);
                        AccessTools.Method(LevelWindowT, "OnStartButtonClicked").Invoke(win[0], null);
                        Plugin.Say("The store starts over from scratch.");
                    }
                }
            }
            catch (Exception e) { Effects.Fail("reset", e); }
            Busy = false;
        }
    }
}
