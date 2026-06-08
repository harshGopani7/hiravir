using Hiravir.Core.Data;
using Hiravir.Core.Models;
using System.Collections.Concurrent;

namespace Hiravir.Core.Accounting;

/// <summary>
/// Maintains an in-memory Directed Acyclic Graph (DAG) of ledger accounts.
/// Supports O(1) ledger lookup and O(depth) recursive parent roll-up.
/// All balance values use decimal — no floating-point arithmetic.
/// </summary>
public sealed class LedgerTreeService
{
    private readonly DatabaseService _db;

    // Primary index: ledgerId → Ledger node
    private readonly ConcurrentDictionary<int, Ledger> _nodes = new();

    // Root nodes (ledgers with no parent)
    private readonly List<Ledger> _roots = new();

    // Lock for tree mutations (rare — only on ledger create/edit)
    private readonly ReaderWriterLockSlim _treeLock = new();

    public LedgerTreeService(DatabaseService db)
    {
        _db = db;
    }

    // ── Initialization ──────────────────────────────────────────────────────

    public async Task LoadAsync()
    {
        var all = await _db.GetAllLedgersAsync();
        RebuildTree(all);
    }

    private void RebuildTree(IReadOnlyList<Ledger> all)
    {
        _treeLock.EnterWriteLock();
        try
        {
            _nodes.Clear();
            _roots.Clear();

            foreach (var l in all)
            {
                l.Children.Clear();
                _nodes[l.Id] = l;
            }

            foreach (var l in all)
            {
                if (l.ParentId.HasValue && _nodes.TryGetValue(l.ParentId.Value, out var parent))
                    parent.Children.Add(l);
                else
                    _roots.Add(l);
            }
        }
        finally
        {
            _treeLock.ExitWriteLock();
        }
    }

    // ── Public Query API ────────────────────────────────────────────────────

    public IReadOnlyList<Ledger> GetRoots()
    {
        _treeLock.EnterReadLock();
        try { return _roots.AsReadOnly(); }
        finally { _treeLock.ExitReadLock(); }
    }

    public Ledger? GetById(int id)
    {
        _nodes.TryGetValue(id, out var l);
        return l;
    }

    public IReadOnlyList<Ledger> GetAll()
    {
        return _nodes.Values.ToList().AsReadOnly();
    }

    // ── Balance Roll-Up ─────────────────────────────────────────────────────

    /// <summary>
    /// After a journal is saved, apply the delta to the affected ledger
    /// and recursively roll up the balance change through all ancestor nodes.
    /// This runs entirely in memory — O(depth) traversal, typically &lt;5 levels.
    /// </summary>
    public void ApplyJournalDelta(int ledgerId, decimal debitDelta, decimal creditDelta)
    {
        if (!_nodes.TryGetValue(ledgerId, out var leaf))
            return;

        decimal netDelta = ComputeNetDelta(leaf.Group, debitDelta, creditDelta);

        // Walk up the tree updating every ancestor's balance in-memory.
        // Ledger.Balance is a plain decimal property; we use a write lock
        // to ensure thread safety during the roll-up traversal.
        _treeLock.EnterWriteLock();
        try
        {
            var current = leaf;
            while (current != null)
            {
                current.Balance += netDelta;
                current = current.ParentId.HasValue && _nodes.TryGetValue(current.ParentId.Value, out var p)
                    ? p : null;
            }
        }
        finally
        {
            _treeLock.ExitWriteLock();
        }
    }

    /// <summary>
    /// Recomputes all balances from DB journals. Called on startup or after bulk import.
    /// </summary>
    public async Task RecomputeAllBalancesAsync()
    {
        var balances = await _db.GetAllLedgerBalancesAsync();
        foreach (var (id, balance) in balances)
        {
            if (_nodes.TryGetValue(id, out var node))
                node.Balance = balance;
        }

        // Roll up group totals bottom-up
        foreach (var root in _roots)
            RollUpGroup(root);
    }

    private static decimal RollUpGroup(Ledger node)
    {
        if (!node.IsGroup)
            return node.Balance;

        decimal total = 0m;
        foreach (var child in node.Children)
            total += RollUpGroup(child);

        node.Balance = total;
        return total;
    }

    private static decimal ComputeNetDelta(LedgerGroup group, decimal debit, decimal credit)
    {
        // Normal debit groups: Assets, Expenses → debit increases balance
        // Normal credit groups: Liabilities, Capital, Income → credit increases balance
        return group is LedgerGroup.Assets or LedgerGroup.Expenses
            ? debit - credit
            : credit - debit;
    }

    /// <summary>
    /// Returns the net balance for <paramref name="ledgerId"/> as of midnight before
    /// <paramref name="periodStart"/> — i.e., the opening balance for a statement period.
    /// Reads directly from the DB for precision; result is not cached in the tree.
    /// </summary>
    public async Task<decimal> GetOpeningBalance(int ledgerId, DateOnly periodStart)
    {
        return await _db.GetLedgerBalanceBeforeDateAsync(ledgerId, periodStart);
    }

    // ── Mutation ────────────────────────────────────────────────────────────

    public async Task AddLedgerAsync(Ledger ledger)
    {
        var id = await _db.InsertLedgerAsync(ledger);
        ledger = ledger with { Id = id };
        _nodes[id] = ledger;

        _treeLock.EnterWriteLock();
        try
        {
            if (ledger.ParentId.HasValue && _nodes.TryGetValue(ledger.ParentId.Value, out var parent))
                parent.Children.Add(ledger);
            else
                _roots.Add(ledger);
        }
        finally
        {
            _treeLock.ExitWriteLock();
        }
    }
}
