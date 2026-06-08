using System.Text.Json.Serialization;

namespace Hiravir.Core.Models;

// ─── Company ─────────────────────────────────────────────────────────────────

public sealed record Company(
    int Id,
    string Name,
    string CurrencySymbol,
    DateOnly FiscalYearStart,
    DateOnly FiscalYearEnd,
    string DbPath
);

// ─── Ledger / Account ────────────────────────────────────────────────────────

public enum LedgerGroup
{
    Assets,
    Liabilities,
    Capital,
    Income,
    Expenses
}

public sealed class Ledger
{
    public int Id { get; init; }
    public int? ParentId { get; init; }
    public string Name { get; set; } = string.Empty;
    public LedgerGroup Group { get; init; }
    public bool IsGroup { get; init; }
    public bool MaintainBillWise { get; set; }

    // In-memory computed balance (not stored in DB — derived from journals)
    [JsonIgnore]
    public decimal Balance { get; set; }

    // DAG adjacency list — populated by LedgerTreeService
    [JsonIgnore]
    public List<Ledger> Children { get; } = new();
}

// ─── Journal / Voucher ───────────────────────────────────────────────────────

public enum VoucherType
{
    Payment,
    Receipt,
    Contra,
    Journal,
    Sales,
    Purchase,
    CreditNote,
    DebitNote
}

public sealed class JournalLineItem
{
    public int Id { get; init; }
    public int VoucherId { get; set; }
    public int LedgerId { get; set; }
    public string LedgerName { get; set; } = string.Empty;
    public decimal DebitAmount { get; set; }
    public decimal CreditAmount { get; set; }
    public string? Narration { get; set; }
    public List<BillAllocation> BillAllocations { get; set; } = new();
}

public sealed class BillAllocation
{
    public int Id { get; set; }
    public int JournalLineId { get; set; }
    public string RefType { get; set; } = string.Empty;   // 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account'
    public string RefName { get; set; } = string.Empty;
    public decimal Amount { get; set; }
}

public sealed class OutstandingRow
{
    public int LedgerId { get; set; }
    public string LedgerName { get; set; } = string.Empty;
    public string RefName { get; set; } = string.Empty;
    public decimal PendingAmount { get; set; }
}

// ─── Stock / Inventory ────────────────────────────────────────────────────────

public sealed class StockGroup
{
    public int Id { get; set; }
    public int? ParentId { get; set; }
    public string Name { get; set; } = string.Empty;
    public decimal TotalQuantity { get; set; }   // rolled-up in memory
    public decimal TotalValue    { get; set; }   // rolled-up in memory
    public List<StockGroup> Children { get; } = new();
    public List<StockItem>  Items    { get; } = new();
}

public sealed class StockItem
{
    public int Id { get; set; }
    public int? GroupId { get; set; }
    public string Name          { get; set; } = string.Empty;
    public string UnitOfMeasure { get; set; } = "Nos";
    public decimal Quantity { get; set; }    // in-memory running balance
    public decimal Value    { get; set; }    // in-memory running value
}

public sealed class InventoryEntry
{
    public int Id          { get; set; }
    public int VoucherId   { get; set; }
    public int StockItemId { get; set; }
    public string ItemName { get; set; } = string.Empty;
    public decimal Quantity { get; set; }
    public decimal Rate     { get; set; }
    public decimal Amount   { get; set; }   // Quantity * Rate
    public bool IsInward    { get; set; }   // true = Purchase/Receipt, false = Sales/Issue
}

public sealed class StockSummaryRow
{
    public int    Id       { get; set; }
    public int?   ParentId { get; set; }
    public string Name     { get; set; } = string.Empty;
    public string Unit     { get; set; } = string.Empty;
    public bool   IsGroup  { get; set; }
    public decimal Quantity { get; set; }
    public decimal Value    { get; set; }
    public decimal Rate     { get; set; }   // avg rate for leaf items
    public List<StockSummaryRow> Children { get; set; } = new();
}

public sealed class Voucher
{
    public int Id { get; init; }
    public VoucherType Type { get; set; }
    public DateOnly Date { get; set; }
    public string VoucherNumber { get; set; } = string.Empty;
    public string? Narration { get; set; }

    // Flexi-fields stored as JSON in DB
    public Dictionary<string, object?> FlexiFields { get; set; } = new();

    public bool IsCancelled { get; set; }

    public List<JournalLineItem>  Lines            { get; set; } = new();
    public List<InventoryEntry>   InventoryEntries { get; set; } = new();
}

// ─── Audit / Edit Log ───────────────────────────────────────────────────────

public sealed class EditLogEntry
{
    public string Id            { get; set; } = string.Empty;  // GUID
    public int    VoucherId     { get; set; }
    public string ActionType    { get; set; } = string.Empty;  // Created|Altered|Cancelled|Deleted
    public long   Timestamp     { get; set; }                  // Unix ms UTC
    public string? PreviousState { get; set; }                 // JSON snapshot of prior Voucher
}

// ─── Ledger Statement (drill-down) ───────────────────────────────────────────

public sealed class LedgerStatementLine
{
    public int    VoucherId     { get; set; }
    public string Date          { get; set; } = string.Empty;
    public string VoucherType   { get; set; } = string.Empty;
    public string VoucherNumber { get; set; } = string.Empty;
    public string Narration     { get; set; } = string.Empty;
    public int    LineId        { get; set; }
    public decimal Debit        { get; set; }
    public decimal Credit       { get; set; }
    public string LineNarration { get; set; } = string.Empty;
    // Populated by the service layer (not DB)
    public decimal RunningBalance { get; set; }
    public bool IsCancelled { get; set; }
}

// ─── DTOs for Interop (AOT-serializable) ─────────────────────────────────────

[JsonSerializable(typeof(Company))]
[JsonSerializable(typeof(List<Company>))]
[JsonSerializable(typeof(Ledger))]
[JsonSerializable(typeof(List<Ledger>))]
[JsonSerializable(typeof(Voucher))]
[JsonSerializable(typeof(List<Voucher>))]
[JsonSerializable(typeof(JournalLineItem))]
[JsonSerializable(typeof(List<JournalLineItem>))]
[JsonSerializable(typeof(BillAllocation))]
[JsonSerializable(typeof(List<BillAllocation>))]
[JsonSerializable(typeof(OutstandingRow))]
[JsonSerializable(typeof(List<OutstandingRow>))]
[JsonSerializable(typeof(StockGroup))]
[JsonSerializable(typeof(List<StockGroup>))]
[JsonSerializable(typeof(StockItem))]
[JsonSerializable(typeof(List<StockItem>))]
[JsonSerializable(typeof(InventoryEntry))]
[JsonSerializable(typeof(List<InventoryEntry>))]
[JsonSerializable(typeof(StockSummaryRow))]
[JsonSerializable(typeof(List<StockSummaryRow>))]
[JsonSerializable(typeof(EditLogEntry))]
[JsonSerializable(typeof(List<EditLogEntry>))]
[JsonSerializable(typeof(InteropRequest))]
[JsonSerializable(typeof(InteropResponse))]
[JsonSerializable(typeof(Dictionary<string, object?>))]
public partial class AppJsonContext : JsonSerializerContext { }

public sealed class InteropRequest
{
    public string Method { get; set; } = string.Empty;
    public string Payload { get; set; } = string.Empty;
}

public sealed class InteropResponse
{
    public bool Ok { get; set; }
    public string Data { get; set; } = string.Empty;
    public string? Error { get; set; }
}
