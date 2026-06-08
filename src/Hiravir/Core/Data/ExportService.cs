using System.Text.Json;
using Hiravir.Core.Models;

namespace Hiravir.Core.Data;

/// <summary>
/// Produces a structured, human-readable JSON snapshot of all company data:
/// ledger chart-of-accounts and every journal voucher with its lines.
/// The JSON format mirrors what a Tally XML export would contain.
/// </summary>
public sealed class ExportService
{
    private readonly DatabaseService _db;

    public ExportService(DatabaseService db) => _db = db;

    /// <summary>
    /// Exports all ledgers + vouchers to a pretty-printed JSON file.
    /// The company meta, chart of accounts, and full journal are included.
    /// </summary>
    public async Task ExportCompanyDataAsync(string destinationFilePath)
    {
        var meta    = await _db.GetCompanyMetaAsync();
        var ledgers = await _db.GetAllLedgersAsync();

        // All vouchers ever recorded (full date range)
        var vouchers = await _db.GetVouchersAsync(
            DateOnly.MinValue, DateOnly.MaxValue, type: null);

        var export = new CompanyExport
        {
            ExportedAt  = DateTime.Now.ToString("O"),
            Company     = new CompanySnapshot
            {
                Name            = meta!.Name,
                CurrencySymbol  = meta.CurrencySymbol,
                FiscalYearStart = meta.FiscalYearStart.ToString("O"),
                FiscalYearEnd   = meta.FiscalYearEnd.ToString("O"),
            },
            ChartOfAccounts = ledgers.Select(l => new LedgerSnapshot
            {
                Id       = l.Id,
                ParentId = l.ParentId,
                Name     = l.Name,
                Group    = l.Group.ToString(),
                IsGroup  = l.IsGroup,
            }).ToList(),
            Vouchers = vouchers.Select(v => new VoucherSnapshot
            {
                Id            = v.Id,
                Type          = v.Type.ToString(),
                Date          = v.Date.ToString("O"),
                VoucherNumber = v.VoucherNumber,
                Narration     = v.Narration,
                IsCancelled   = v.IsCancelled,
                Lines         = v.Lines.Select(l => new LineSnapshot
                {
                    LedgerId     = l.LedgerId,
                    LedgerName   = l.LedgerName,
                    DebitAmount  = l.DebitAmount,
                    CreditAmount = l.CreditAmount,
                    Narration    = l.Narration,
                }).ToList(),
            }).ToList(),
        };

        var opts = new JsonSerializerOptions { WriteIndented = true };
        var json = JsonSerializer.Serialize(export, opts);
        await File.WriteAllTextAsync(destinationFilePath, json);
    }
}

// ─── Export DTOs (plain POCOs — no AOT constraint since only used at export time) ──

file sealed class CompanyExport
{
    public string ExportedAt { get; set; } = string.Empty;
    public CompanySnapshot Company { get; set; } = new();
    public List<LedgerSnapshot> ChartOfAccounts { get; set; } = new();
    public List<VoucherSnapshot> Vouchers { get; set; } = new();
}

file sealed class CompanySnapshot
{
    public string Name            { get; set; } = string.Empty;
    public string CurrencySymbol  { get; set; } = string.Empty;
    public string FiscalYearStart { get; set; } = string.Empty;
    public string FiscalYearEnd   { get; set; } = string.Empty;
}

file sealed class LedgerSnapshot
{
    public int     Id       { get; set; }
    public int?    ParentId { get; set; }
    public string  Name     { get; set; } = string.Empty;
    public string  Group    { get; set; } = string.Empty;
    public bool    IsGroup  { get; set; }
}

file sealed class VoucherSnapshot
{
    public int     Id            { get; set; }
    public string  Type          { get; set; } = string.Empty;
    public string  Date          { get; set; } = string.Empty;
    public string  VoucherNumber { get; set; } = string.Empty;
    public string? Narration     { get; set; }
    public bool    IsCancelled   { get; set; }
    public List<LineSnapshot> Lines { get; set; } = new();
}

file sealed class LineSnapshot
{
    public int     LedgerId     { get; set; }
    public string  LedgerName   { get; set; } = string.Empty;
    public decimal DebitAmount  { get; set; }
    public decimal CreditAmount { get; set; }
    public string? Narration    { get; set; }
}
