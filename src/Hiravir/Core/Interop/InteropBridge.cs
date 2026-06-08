using Microsoft.JSInterop;
using System.Diagnostics;
using System.Text.Json;
using Hiravir.Core.Accounting;
using Hiravir.Core.Data;
using Hiravir.Core.Models;

namespace Hiravir.Core.Interop;

/// <summary>
/// Zero-HTTP in-process interop bridge between the React UI and the C# engine.
/// React calls DotNet.invokeMethodAsync('Hiravir', 'Dispatch', jsonPayload).
/// All methods are [JSInvokable] and run synchronously in the WebView2 JS thread context.
/// </summary>
public sealed class InteropBridge : IAsyncDisposable
{
    private readonly CompanyService _company;
    private readonly LedgerTreeService _ledgerTree;
    private readonly VoucherService _vouchers;
    private readonly ExportService _export;
    private IJSRuntime? _js;
    private DotNetObjectReference<InteropBridge>? _selfRef;

    public InteropBridge(
        CompanyService company,
        LedgerTreeService ledgerTree,
        VoucherService vouchers,
        ExportService export)
    {
        _company = company;
        _ledgerTree = ledgerTree;
        _vouchers = vouchers;
        _export = export;
    }

    public async Task InitializeAsync(IJSRuntime js)
    {
        _js = js;
        _selfRef = DotNetObjectReference.Create(this);
        await js.InvokeVoidAsync("hiravir.registerBridge", _selfRef);
    }

    // ── Main Dispatch Method (called from React) ─────────────────────────────

    [JSInvokable]
    public async Task<string> Dispatch(string method, string payload)
    {
        try
        {
            var result = method switch
            {
                "company.list"         => await HandleCompanyList(),
                "company.create"       => await HandleCompanyCreate(payload),
                "company.open"         => await HandleCompanyOpen(payload),
                "ledger.list"          => HandleLedgerList(),
                "ledger.tree"          => HandleLedgerTree(),
                "ledger.create"        => await HandleLedgerCreate(payload),
                "voucher.save"         => await HandleVoucherSave(payload),
                "voucher.list"         => await HandleVoucherList(payload),
                "voucher.get"          => await HandleVoucherGet(payload),
                "voucher.delete"       => await HandleVoucherDelete(payload),
                "voucher.update"       => await HandleVoucherUpdate(payload),
                "voucher.cancel"       => await HandleVoucherCancel(payload),
                "report.trialBalance"  => HandleTrialBalance(),
                "report.ledgerStatement" => await HandleLedgerStatement(payload),
                "report.daybook"       => await HandleDaybook(payload),
                "report.outstanding"   => await HandleOutstanding(),
                "report.stockSummary"  => HandleStockSummary(),
                "stock.group.create"   => await HandleStockGroupCreate(payload),
                "stock.item.create"    => await HandleStockItemCreate(payload),
                "stock.item.list"      => HandleStockItemList(),
                "voucher.saveInvoice"  => await HandleSaveInvoice(payload),
                "voucher.editLog"      => await HandleVoucherEditLog(payload),
                "data.backup"          => await HandleDataBackup(),
                "data.export"          => await HandleDataExport(),
                "data.restore"         => await HandleDataRestore(),
                "voucher.poc"          => await HandleVoucherPoc(payload),
                _                      => Error($"Unknown method: {method}")
            };
            return result;
        }
        catch (Exception ex)
        {
            return Error(ex.Message);
        }
    }

    // ── Company Handlers ────────────────────────────────────────────────────

    private Task<string> HandleCompanyList()
    {
        var files = _company.ListCompanyFiles();
        return Task.FromResult(Ok(files));
    }

    private async Task<string> HandleCompanyCreate(string payload)
    {
        var req = JsonSerializer.Deserialize<CreateCompanyRequest>(payload)!;
        var c = await _company.CreateCompanyAsync(
            req.Name, req.CurrencySymbol,
            DateOnly.Parse(req.FiscalYearStart),
            DateOnly.Parse(req.FiscalYearEnd));
        return Ok(c);
    }

    private async Task<string> HandleCompanyOpen(string payload)
    {
        var req = JsonSerializer.Deserialize<OpenCompanyRequest>(payload)!;
        var c = await _company.OpenCompanyAsync(req.DbPath);
        return Ok(c);
    }

    // ── Ledger Handlers ─────────────────────────────────────────────────────

    private string HandleLedgerList()
    {
        var all = _ledgerTree.GetAll();
        return Ok(all);
    }

    private string HandleLedgerTree()
    {
        var roots = _ledgerTree.GetRoots();
        return Ok(roots);
    }

    private async Task<string> HandleLedgerCreate(string payload)
    {
        var req = JsonSerializer.Deserialize<CreateLedgerRequest>(payload)!;
        var ledger = new Ledger
        {
            ParentId = req.ParentId,
            Name = req.Name,
            Group = Enum.Parse<LedgerGroup>(req.Group),
            IsGroup = req.IsGroup,
            MaintainBillWise = req.MaintainBillWise
        };
        await _ledgerTree.AddLedgerAsync(ledger);
        return Ok(ledger);
    }

    // ── Voucher Handlers ────────────────────────────────────────────────────

    private async Task<string> HandleVoucherSave(string payload)
    {
        var voucher = JsonSerializer.Deserialize<Voucher>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var (ok, error, saved) = await _vouchers.SaveVoucherAsync(voucher);
        return ok ? Ok(saved) : Error(error!);
    }

    private async Task<string> HandleVoucherList(string payload)
    {
        var req = JsonSerializer.Deserialize<VoucherListRequest>(payload)!;
        var list = await _vouchers.GetVouchersAsync(
            DateOnly.Parse(req.From),
            DateOnly.Parse(req.To),
            req.Type.HasValue ? (VoucherType?)req.Type.Value : null);
        return Ok(list);
    }

    private async Task<string> HandleVoucherGet(string payload)
    {
        var req = JsonSerializer.Deserialize<IdRequest>(payload)!;
        var v = await _vouchers.GetVoucherByIdAsync(req.Id);
        return v is not null ? Ok(v) : Error("Not found");
    }

    private async Task<string> HandleVoucherDelete(string payload)
    {
        var req = JsonSerializer.Deserialize<IdRequest>(payload)!;
        var (ok, error) = await _vouchers.DeleteVoucherAsync(req.Id);
        return ok ? Ok(new { deleted = true }) : Error(error!);
    }

    private async Task<string> HandleVoucherCancel(string payload)
    {
        var req = JsonSerializer.Deserialize<IdRequest>(payload)!;
        var (ok, error) = await _vouchers.CancelVoucherAsync(req.Id);
        return ok ? Ok(new { cancelled = true }) : Error(error!);
    }

    private async Task<string> HandleVoucherUpdate(string payload)
    {
        var voucher = JsonSerializer.Deserialize<Voucher>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var (ok, error, updated) = await _vouchers.UpdateVoucherAsync(voucher);
        return ok ? Ok(updated) : Error(error!);
    }

    private async Task<string> HandleLedgerStatement(string payload)
    {
        var req = JsonSerializer.Deserialize<LedgerStatementRequest>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var ledger = _ledgerTree.GetById(req.LedgerId);
        if (ledger is null) return Error($"Ledger {req.LedgerId} not found");

        var from = DateOnly.Parse(req.From);
        var to   = DateOnly.Parse(req.To);

        // Opening balance = all movements before the period start (DB query, precise)
        var openingBalance = await _ledgerTree.GetOpeningBalance(req.LedgerId, from);

        // Lines carry RunningBalance already computed by VoucherService
        var lines = await _vouchers.GetLedgerStatementAsync(req.LedgerId, from, to);

        var closingBalance = lines.Count > 0 ? lines[^1].RunningBalance : openingBalance;

        return Ok(new
        {
            ledgerId       = req.LedgerId,
            ledgerName     = ledger.Name,
            from           = from.ToString("yyyy-MM-dd"),
            to             = to.ToString("yyyy-MM-dd"),
            openingBalance,
            closingBalance,
            lines
        });
    }

    // ── Phase 1 PoC Handler ────────────────────────────────────────────────

    /// <summary>
    /// Validates a mock 4-line double-entry voucher, persists it to SQLite,
    /// and returns sub-millisecond timing stats back to the React UI.
    /// </summary>
    private async Task<string> HandleVoucherPoc(string payload)
    {
        var sw = Stopwatch.StartNew();
        var tSubmit = DateTimeOffset.UtcNow;

        // Deserialize the voucher sent from the React grid
        var voucher = JsonSerializer.Deserialize<Voucher>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        // ① Validate double-entry balance (pure in-memory, decimal)
        var tValidateStart = sw.Elapsed;
        var validation = _vouchers.Validator.Validate(voucher);
        var tValidateEnd = sw.Elapsed;

        if (!validation.IsValid)
            return Error($"Validation failed: {validation.ErrorMessage}");

        // ② Persist to SQLite (WAL mode)
        var tSaveStart = sw.Elapsed;
        var (ok, error, saved) = await _vouchers.SaveVoucherAsync(voucher);
        var tSaveEnd = sw.Elapsed;

        if (!ok)
            return Error($"Save failed: {error}");

        sw.Stop();

        // Return timing breakdown to React UI
        return Ok(new
        {
            voucherId       = saved!.Id,
            voucherNumber   = saved.VoucherNumber,
            lineCount       = saved.Lines.Count,
            submitUtc       = tSubmit.ToString("O"),
            confirmUtc      = DateTimeOffset.UtcNow.ToString("O"),
            totalElapsedMs  = sw.Elapsed.TotalMilliseconds,
            validateMs      = (tValidateEnd - tValidateStart).TotalMilliseconds,
            saveMs          = (tSaveEnd - tSaveStart).TotalMilliseconds,
            debitTotal      = saved.Lines.Sum(l => l.DebitAmount),
            creditTotal     = saved.Lines.Sum(l => l.CreditAmount),
            balanced        = saved.Lines.Sum(l => l.DebitAmount) == saved.Lines.Sum(l => l.CreditAmount)
        });
    }

    // ── Report Handlers ─────────────────────────────────────────────────────

    private string HandleTrialBalance()
    {
        var all = _ledgerTree.GetAll();

        // Build hierarchical structure: group by LedgerGroup enum, then by parent name
        var groups = Enum.GetValues<LedgerGroup>()
            .Select(grp =>
            {
                var groupLedgers = all.Where(l => l.Group == grp).ToList();
                var groupNodes   = groupLedgers.Where(l => l.IsGroup).ToList();
                var leafLedgers  = groupLedgers.Where(l => !l.IsGroup).ToList();

                // Flatten into rows: each group heading followed by its leaf children
                var rows = new List<object>();
                foreach (var g in groupNodes.Where(n => !n.ParentId.HasValue || !groupNodes.Any(p => p.Id == n.ParentId)))
                {
                    var children = leafLedgers
                        .Where(l => l.ParentId == g.Id)
                        .Select(l => new
                        {
                            id        = l.Id,
                            name      = l.Name,
                            parentId  = l.ParentId,
                            isGroup   = false,
                            debit     = l.Balance > 0 ? l.Balance : 0m,
                            credit    = l.Balance < 0 ? -l.Balance : 0m,
                            balance   = l.Balance
                        }).ToList();

                    rows.Add(new
                    {
                        id           = g.Id,
                        name         = g.Name,
                        isGroup      = true,
                        subtotalDebit  = children.Sum(c => c.debit),
                        subtotalCredit = children.Sum(c => c.credit),
                        children
                    });
                }

                // Also add orphan leaf ledgers not under any group node
                var orphans = leafLedgers.Where(l => !groupNodes.Any(g => g.Id == l.ParentId)).ToList();
                foreach (var o in orphans)
                {
                    rows.Add(new
                    {
                        id           = o.Id,
                        name         = o.Name,
                        isGroup      = false,
                        subtotalDebit  = o.Balance > 0 ? o.Balance : 0m,
                        subtotalCredit = o.Balance < 0 ? -o.Balance : 0m,
                        children     = new List<object>()
                    });
                }

                return new
                {
                    group          = grp.ToString(),
                    totalDebit     = leafLedgers.Sum(l => l.Balance > 0 ? l.Balance : 0m),
                    totalCredit    = leafLedgers.Sum(l => l.Balance < 0 ? -l.Balance : 0m),
                    rows
                };
            })
            .Where(g => g.rows.Count > 0)
            .ToList();

        return Ok(groups);
    }

    private async Task<string> HandleOutstanding()
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var rows = await _company.GetDatabaseService().GetBillsOutstandingAsync();
        return Ok(rows);
    }

    // ── Audit / Edit Log Handler ─────────────────────────────────────────

    private async Task<string> HandleVoucherEditLog(string payload)
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var req = JsonSerializer.Deserialize<IdRequest>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var entries = await _company.GetDatabaseService().GetEditLogAsync(req.Id);
        return Ok(entries);
    }

    // ── Stock / Inventory Handlers ───────────────────────────────────────────

    private string HandleStockSummary()
    {
        var rows = _company.GetStockTree().GetSummary();
        return Ok(rows);
    }

    private async Task<string> HandleStockGroupCreate(string payload)
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var req = JsonSerializer.Deserialize<CreateStockGroupRequest>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var g = new StockGroup { ParentId = req.ParentId, Name = req.Name };
        await _company.GetStockTree().AddGroupAsync(_company.GetDatabaseService(), g);
        return Ok(g);
    }

    private async Task<string> HandleStockItemCreate(string payload)
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var req = JsonSerializer.Deserialize<CreateStockItemRequest>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;
        var item = new StockItem { GroupId = req.GroupId, Name = req.Name, UnitOfMeasure = req.UnitOfMeasure };
        await _company.GetStockTree().AddItemAsync(_company.GetDatabaseService(), item);
        return Ok(item);
    }

    private string HandleStockItemList()
    {
        var items = _company.GetStockTree().GetAllItems();
        return Ok(items);
    }

    /// <summary>
    /// Saves an Item Invoice: generates journal lines automatically, saves inventory entries.
    /// Rule: Party A/c Dr by total, Sales/Purchase Ledger Cr by total.
    /// is_inward = true for Purchase, false for Sales.
    /// </summary>
    private async Task<string> HandleSaveInvoice(string payload)
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var req = JsonSerializer.Deserialize<SaveInvoiceRequest>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

        var totalAmount = req.Items.Sum(i => i.Amount);
        bool isInward = req.VoucherType is "Purchase" or "DebitNote";

        var voucher = new Voucher
        {
            Type          = Enum.Parse<VoucherType>(req.VoucherType),
            Date          = DateOnly.Parse(req.Date),
            VoucherNumber = req.VoucherNumber,
            Narration     = req.Narration,
            Lines =
            [
                new JournalLineItem
                {
                    LedgerId    = req.PartyLedgerId,
                    DebitAmount = isInward ? 0 : totalAmount,
                    CreditAmount = isInward ? totalAmount : 0
                },
                new JournalLineItem
                {
                    LedgerId     = req.TradingLedgerId,
                    DebitAmount  = isInward ? totalAmount : 0,
                    CreditAmount = isInward ? 0 : totalAmount
                }
            ],
            InventoryEntries = req.Items.Select(i => new InventoryEntry
            {
                StockItemId = i.StockItemId,
                ItemName    = i.ItemName,
                Quantity    = i.Quantity,
                Rate        = i.Rate,
                Amount      = i.Amount,
                IsInward    = isInward
            }).ToList()
        };

        var (ok, error, saved) = await _vouchers.SaveVoucherAsync(voucher);
        if (!ok) return Error(error!);

        // Update stock tree in memory
        foreach (var ie in saved!.InventoryEntries)
            await _company.GetStockTree().ApplyEntryAsync(ie);

        return Ok(saved);
    }

    private async Task<string> HandleDaybook(string payload)
    {
        var req = JsonSerializer.Deserialize<DaybookRequest>(payload,
            new JsonSerializerOptions { PropertyNameCaseInsensitive = true });
        var from = DateOnly.Parse(req?.From ?? DateOnly.FromDateTime(DateTime.Today).ToString("O"));
        var to   = DateOnly.Parse(req?.To   ?? from.ToString("O"));

        var vouchers = await _vouchers.GetVouchersAsync(from, to, null);

        // Flatten to daybook rows — one row per journal line
        var rows = vouchers.SelectMany(v => v.Lines.Select(l => new
        {
            voucherId     = v.Id,
            date          = v.Date.ToString("yyyy-MM-dd"),
            voucherNumber = v.VoucherNumber,
            voucherType   = v.Type.ToString(),
            narration     = v.Narration ?? string.Empty,
            ledgerId      = l.LedgerId,
            ledgerName    = l.LedgerName,
            debit         = v.IsCancelled ? 0m : l.DebitAmount,
            credit        = v.IsCancelled ? 0m : l.CreditAmount,
            lineNarration = l.Narration ?? string.Empty,
            isCancelled   = v.IsCancelled
        })).ToList();

        var totalDebit  = rows.Sum(r => r.debit);
        var totalCredit = rows.Sum(r => r.credit);

        return Ok(new { rows, totalDebit, totalCredit, from = from.ToString("yyyy-MM-dd"), to = to.ToString("yyyy-MM-dd") });
    }

    // ── Data Management Handlers ─────────────────────────────────────────────

    private async Task<string> HandleDataBackup()
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var dest = await PromptSaveFileAsync(
            title:       "Save Database Backup",
            defaultName: $"{Path.GetFileNameWithoutExtension(_company.ActiveCompany.DbPath)}_backup_{DateTime.Now:yyyyMMdd_HHmmss}",
            extension:   ".hirdb",
            filterName:  "Hiravir Database");
        if (dest is null) return Ok(new { cancelled = true, path = (string?)null });

        await _company.GetDatabaseService().CreateBackupAsync(dest);
        return Ok(new { cancelled = false, path = dest });
    }

    private async Task<string> HandleDataExport()
    {
        if (_company.ActiveCompany is null) return Error("No company open.");
        var dest = await PromptSaveFileAsync(
            title:       "Export Company Data",
            defaultName: $"{Path.GetFileNameWithoutExtension(_company.ActiveCompany.DbPath)}_export_{DateTime.Now:yyyyMMdd_HHmmss}",
            extension:   ".json",
            filterName:  "JSON Data Export");
        if (dest is null) return Ok(new { cancelled = true, path = (string?)null });

        await _export.ExportCompanyDataAsync(dest);
        return Ok(new { cancelled = false, path = dest });
    }

    private async Task<string> HandleDataRestore()
    {
        if (_company.ActiveCompany is null) return Error("No company open.");

        var source = await PromptOpenFileAsync(
            title:      "Select Backup to Restore",
            filterName: "Hiravir Database Backup",
            extension:  ".hirdb");
        if (source is null) return Ok(new { cancelled = true, path = (string?)null });

        var activeDbPath = _company.ActiveCompany.DbPath;

        // Reinitialize callback: re-open the company from the same path after file swap
        async Task Reinitialize()
        {
            await _company.OpenCompanyAsync(activeDbPath);
        }

        await _company.GetDatabaseService().RestoreBackupAsync(source, activeDbPath, Reinitialize);
        return Ok(new { cancelled = false, path = source });
    }

    /// <summary>
    /// Shows the MAUI FilePicker (open/pick) dialog.
    /// Returns the chosen file path, or null if the user cancelled.
    /// </summary>
    private static async Task<string?> PromptOpenFileAsync(
        string title, string filterName, string extension)
    {
        var options = new PickOptions
        {
            PickerTitle = title,
            FileTypes = new FilePickerFileType(
                new Dictionary<DevicePlatform, IEnumerable<string>>
                {
                    { DevicePlatform.WinUI, new[] { extension } },
                    { DevicePlatform.macOS, new[] { extension.TrimStart('.') } },
                })
        };
        var result = await FilePicker.Default.PickAsync(options);
        return result?.FullPath;
    }

    /// <summary>
    /// Shows a native Windows FileSavePicker.
    /// Returns the chosen file path, or null if the user cancelled.
    /// </summary>
    private static async Task<string?> PromptSaveFileAsync(
        string title, string defaultName, string extension, string filterName)
    {
#if WINDOWS
        var picker = new Windows.Storage.Pickers.FileSavePicker
        {
            SuggestedStartLocation = Windows.Storage.Pickers.PickerLocationId.DocumentsLibrary,
            SuggestedFileName      = defaultName,
            CommitButtonText       = "Save",
        };
        picker.FileTypeChoices.Add(filterName, new List<string> { extension });

        // Associate picker with the active window handle (required on Windows)
        var hwnd = ((MauiWinUIWindow)Microsoft.Maui.ApplicationModel.WindowStateManager
            .Default.GetActiveWindow()!.Handler.PlatformView!).WindowHandle;
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);

        var file = await picker.PickSaveFileAsync();
        return file?.Path;
#else
        // Non-Windows fallback: write to Documents/Hiravir/
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "Hiravir", "Exports");
        Directory.CreateDirectory(dir);
        return Path.Combine(dir, defaultName + extension);
#endif
    }

    // ── Serialization Helpers ────────────────────────────────────────────────

    private static string Ok<T>(T data) =>
        JsonSerializer.Serialize(new { ok = true, data });

    private static string Error(string msg) =>
        JsonSerializer.Serialize(new { ok = false, error = msg });

    public async ValueTask DisposeAsync()
    {
        if (_selfRef is not null)
        {
            try { await _js!.InvokeVoidAsync("hiravir.unregisterBridge"); } catch { }
            _selfRef.Dispose();
        }
    }
}

// ── Request DTOs ─────────────────────────────────────────────────────────────

internal sealed record CreateCompanyRequest(
    string Name, string CurrencySymbol,
    string FiscalYearStart, string FiscalYearEnd);

internal sealed record OpenCompanyRequest(string DbPath);

internal sealed record CreateLedgerRequest(
    int? ParentId, string Name, string Group, bool IsGroup, bool MaintainBillWise = false);

internal sealed record VoucherListRequest(string From, string To, int? Type);

internal sealed record DaybookRequest(string? From, string? To);

internal sealed record LedgerStatementRequest(int LedgerId, string From, string To);

internal sealed record IdRequest(int Id);

internal sealed record CreateStockGroupRequest(int? ParentId, string Name);

internal sealed record CreateStockItemRequest(int? GroupId, string Name, string UnitOfMeasure = "Nos");

internal sealed record InvoiceItemRequest(
    int StockItemId, string ItemName, decimal Quantity, decimal Rate, decimal Amount);

internal sealed record SaveInvoiceRequest(
    string VoucherType, string Date, string VoucherNumber, string? Narration,
    int PartyLedgerId, int TradingLedgerId,
    List<InvoiceItemRequest> Items);
