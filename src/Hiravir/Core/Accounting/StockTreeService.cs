using Hiravir.Core.Data;
using Hiravir.Core.Models;
using System.Collections.Concurrent;

namespace Hiravir.Core.Accounting;

/// <summary>
/// Concurrent in-memory DAG for real-time stock quantity and value tracking.
/// Mirrors the LedgerTreeService pattern but for physical inventory.
/// All mutations are serialised via an asynclock (single writer, concurrent reads fine
/// because the whole tree snapshot is immutable after each rebuild).
/// </summary>
public sealed class StockTreeService
{
    // ── flat maps ────────────────────────────────────────────────────────────
    private readonly ConcurrentDictionary<int, StockGroup> _groups = new();
    private readonly ConcurrentDictionary<int, StockItem>  _items  = new();

    // Root groups (no parent)
    private readonly List<StockGroup> _roots = new();

    private readonly SemaphoreSlim _lock = new(1, 1);

    // ── Initialization ───────────────────────────────────────────────────────

    /// <summary>
    /// Loads all stock groups, items, and existing inventory entries from DB,
    /// builds the in-memory tree and computes opening balances.
    /// </summary>
    public async Task InitializeAsync(DatabaseService db)
    {
        await _lock.WaitAsync();
        try
        {
            _groups.Clear();
            _items.Clear();
            _roots.Clear();

            // Load flat lists
            var groups  = await db.GetAllStockGroupsAsync();
            var items   = await db.GetAllStockItemsAsync();
            var entries = await db.GetAllInventoryEntriesAsync();

            // Build group map
            foreach (var g in groups)
                _groups[g.Id] = g;

            // Wire parent–child for groups
            foreach (var g in groups)
            {
                if (g.ParentId.HasValue && _groups.TryGetValue(g.ParentId.Value, out var parent))
                    parent.Children.Add(g);
                else
                    _roots.Add(g);
            }

            // Load items into map and attach to parent group
            foreach (var item in items)
            {
                _items[item.Id] = item;
                if (item.GroupId.HasValue && _groups.TryGetValue(item.GroupId.Value, out var grp))
                    grp.Items.Add(item);
            }

            // Apply all inventory entries to compute running balances
            foreach (var ie in entries)
                ApplyEntryUnsafe(ie);

            // Roll up group totals
            foreach (var root in _roots)
                RollUpUnsafe(root);
        }
        finally
        {
            _lock.Release();
        }
    }

    // ── Public mutations ─────────────────────────────────────────────────────

    public async Task<StockGroup> AddGroupAsync(DatabaseService db, StockGroup g)
    {
        var id = await db.InsertStockGroupAsync(g);
        g.Id = id;

        await _lock.WaitAsync();
        try
        {
            _groups[id] = g;
            if (g.ParentId.HasValue && _groups.TryGetValue(g.ParentId.Value, out var parent))
                parent.Children.Add(g);
            else
                _roots.Add(g);
        }
        finally { _lock.Release(); }

        return g;
    }

    public async Task<StockItem> AddItemAsync(DatabaseService db, StockItem item)
    {
        var id = await db.InsertStockItemAsync(item);
        item.Id = id;

        await _lock.WaitAsync();
        try
        {
            _items[id] = item;
            if (item.GroupId.HasValue && _groups.TryGetValue(item.GroupId.Value, out var grp))
                grp.Items.Add(item);
        }
        finally { _lock.Release(); }

        return item;
    }

    /// <summary>
    /// Apply a new inventory entry to the in-memory tree (call after DB insert).
    /// </summary>
    public async Task ApplyEntryAsync(InventoryEntry ie)
    {
        await _lock.WaitAsync();
        try
        {
            ApplyEntryUnsafe(ie);
            // Re-roll the affected root
            if (_items.TryGetValue(ie.StockItemId, out var item) &&
                item.GroupId.HasValue &&
                _groups.TryGetValue(item.GroupId.Value, out var grp))
            {
                var root = FindRoot(grp);
                if (root is not null) RollUpUnsafe(root);
            }
        }
        finally { _lock.Release(); }
    }

    /// <summary>
    /// Reverse an inventory entry (call when voucher is updated/cancelled).
    /// </summary>
    public async Task ReverseEntryAsync(InventoryEntry ie)
    {
        var reversed = ie with { IsInward = !ie.IsInward };
        await ApplyEntryAsync(reversed);
    }

    // ── Queries ──────────────────────────────────────────────────────────────

    public List<StockItem> GetAllItems() => _items.Values.ToList();

    /// <summary>
    /// Returns a serialisable snapshot of the stock summary tree.
    /// </summary>
    public List<StockSummaryRow> GetSummary()
    {
        return _roots.Select(BuildSummaryRow).ToList();
    }

    // ── Private helpers ──────────────────────────────────────────────────────

    private void ApplyEntryUnsafe(InventoryEntry ie)
    {
        if (!_items.TryGetValue(ie.StockItemId, out var item)) return;
        if (ie.IsInward)
        {
            item.Quantity += ie.Quantity;
            item.Value    += ie.Amount;
        }
        else
        {
            item.Quantity -= ie.Quantity;
            item.Value    -= ie.Amount;
        }
    }

    private void RollUpUnsafe(StockGroup grp)
    {
        grp.TotalQuantity = 0;
        grp.TotalValue    = 0;

        foreach (var child in grp.Children)
        {
            RollUpUnsafe(child);
            grp.TotalQuantity += child.TotalQuantity;
            grp.TotalValue    += child.TotalValue;
        }

        foreach (var item in grp.Items)
        {
            grp.TotalQuantity += item.Quantity;
            grp.TotalValue    += item.Value;
        }
    }

    private StockGroup? FindRoot(StockGroup grp)
    {
        if (!grp.ParentId.HasValue) return grp;
        if (_groups.TryGetValue(grp.ParentId.Value, out var parent))
            return FindRoot(parent);
        return grp;
    }

    private static StockSummaryRow BuildSummaryRow(StockGroup g)
    {
        var row = new StockSummaryRow
        {
            Id       = g.Id,
            ParentId = g.ParentId,
            Name     = g.Name,
            IsGroup  = true,
            Quantity = g.TotalQuantity,
            Value    = g.TotalValue,
        };

        foreach (var child in g.Children)
            row.Children.Add(BuildSummaryRow(child));

        foreach (var item in g.Items)
        {
            var avgRate = item.Quantity != 0 ? item.Value / item.Quantity : 0m;
            row.Children.Add(new StockSummaryRow
            {
                Id       = item.Id,
                ParentId = g.Id,
                Name     = item.Name,
                Unit     = item.UnitOfMeasure,
                IsGroup  = false,
                Quantity = item.Quantity,
                Value    = item.Value,
                Rate     = avgRate,
            });
        }

        return row;
    }
}
