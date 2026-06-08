using Hiravir.Core.Data;
using Hiravir.Core.Models;

namespace Hiravir.Core.Accounting;

/// <summary>
/// Orchestrates voucher persistence: validates → writes atomically → rolls up balances.
/// </summary>
public sealed class VoucherService
{
    private readonly DatabaseService _db;
    private readonly LedgerTreeService _ledgerTree;
    private readonly VoucherValidator _validator;

    public VoucherValidator Validator => _validator;

    public VoucherService(DatabaseService db, LedgerTreeService ledgerTree)
    {
        _db = db;
        _ledgerTree = ledgerTree;
        _validator = new VoucherValidator();
    }

    public async Task<(bool Ok, string? Error, Voucher? Saved)> SaveVoucherAsync(Voucher voucher)
    {
        var result = _validator.Validate(voucher);
        if (!result.IsValid)
            return (false, result.ErrorMessage, null);

        var saved = await _db.InsertVoucherAsync(voucher);

        // In-memory balance roll-up for each line
        foreach (var line in saved.Lines)
        {
            _ledgerTree.ApplyJournalDelta(line.LedgerId, line.DebitAmount, line.CreditAmount);
        }

        return (true, null, saved);
    }

    public async Task<List<Voucher>> GetVouchersAsync(DateOnly from, DateOnly to, VoucherType? type = null)
    {
        return await _db.GetVouchersAsync(from, to, type);
    }

    public async Task<Voucher?> GetVoucherByIdAsync(int id)
    {
        return await _db.GetVoucherByIdAsync(id);
    }

    /// <summary>
    /// Atomically updates a voucher:
    ///   a) Validates the new lines.
    ///   b) Reverses the old lines' impact on the in-memory ledger tree.
    ///   c) Replaces the DB record (header + lines) in a single SQLite transaction.
    ///   d) Applies the new lines' impact to the in-memory ledger tree.
    /// If the DB write fails the tree remains consistent (reversal was already applied),
    /// so we re-apply the old deltas to restore the pre-call state.
    /// </summary>
    public async Task<(bool Ok, string? Error, Voucher? Updated)> UpdateVoucherAsync(Voucher updated)
    {
        var result = _validator.Validate(updated);
        if (!result.IsValid)
            return (false, result.ErrorMessage, null);

        // Load the existing voucher to get its original lines
        var existing = await _db.GetVoucherByIdAsync(updated.Id);
        if (existing is null)
            return (false, $"Voucher {updated.Id} not found.", null);

        // ① Reverse old in-memory deltas
        foreach (var line in existing.Lines)
            _ledgerTree.ApplyJournalDelta(line.LedgerId, -line.DebitAmount, -line.CreditAmount);

        // Snapshot existing state before overwrite
        var prevJson = System.Text.Json.JsonSerializer.Serialize(
            existing, Hiravir.Core.Models.AppJsonContext.Default.Voucher);

        try
        {
            // ② Atomically replace in SQLite
            var saved = await _db.UpdateVoucherAsync(updated, prevJson);

            // ③ Apply new in-memory deltas
            foreach (var line in saved.Lines)
                _ledgerTree.ApplyJournalDelta(line.LedgerId, line.DebitAmount, line.CreditAmount);

            return (true, null, saved);
        }
        catch (Exception ex)
        {
            // DB write failed — restore the original tree state so it remains consistent
            foreach (var line in existing.Lines)
                _ledgerTree.ApplyJournalDelta(line.LedgerId, line.DebitAmount, line.CreditAmount);
            return (false, ex.Message, null);
        }
    }

    public async Task<List<LedgerStatementLine>> GetLedgerStatementAsync(
        int ledgerId, DateOnly from, DateOnly to)
    {
        // Opening balance = sum of all lines for this ledger BEFORE the from date
        var openingBalance = _ledgerTree.GetOpeningBalance(ledgerId, from);

        var lines = await _db.GetLedgerStatementAsync(ledgerId, from, to);

        // Compute running balance
        decimal running = openingBalance;
        foreach (var l in lines)
        {
            running += l.Debit - l.Credit;
            l.RunningBalance = running;
        }

        return lines;
    }

    /// <summary>
    /// Cancels a voucher: reverses its balance impact on the in-memory tree,
    /// flags is_cancelled=1 in DB, and zeroes the journal_line amounts.
    /// The voucher header row is preserved for audit trail / voucher number continuity.
    /// </summary>
    public async Task<(bool Ok, string? Error)> CancelVoucherAsync(int id)
    {
        var voucher = await _db.GetVoucherByIdAsync(id);
        if (voucher is null)
            return (false, "Voucher not found.");
        if (voucher.IsCancelled)
            return (false, "Voucher is already cancelled.");

        try
        {
            // ① Reverse in-memory tree deltas using original (pre-zero) lines
            foreach (var line in voucher.Lines)
                _ledgerTree.ApplyJournalDelta(line.LedgerId, -line.DebitAmount, -line.CreditAmount);

            // ② DB: set is_cancelled=1 + zero amounts
            await _db.CancelVoucherAsync(id);
            return (true, null);
        }
        catch (Exception ex)
        {
            // Restore tree if DB write failed
            foreach (var line in voucher.Lines)
                _ledgerTree.ApplyJournalDelta(line.LedgerId, line.DebitAmount, line.CreditAmount);
            return (false, ex.Message);
        }
    }

    public async Task<(bool Ok, string? Error)> DeleteVoucherAsync(int id)
    {
        var voucher = await _db.GetVoucherByIdAsync(id);
        if (voucher is null)
            return (false, "Voucher not found.");

        // Reverse journal deltas in memory
        foreach (var line in voucher.Lines)
            _ledgerTree.ApplyJournalDelta(line.LedgerId, -line.DebitAmount, -line.CreditAmount);

        var prevJson = System.Text.Json.JsonSerializer.Serialize(
            voucher, Hiravir.Core.Models.AppJsonContext.Default.Voucher);

        await _db.DeleteVoucherAsync(id, prevJson);
        return (true, null);
    }
}
