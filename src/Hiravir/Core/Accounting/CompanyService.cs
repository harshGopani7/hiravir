using Hiravir.Core.Data;
using Hiravir.Core.Models;

namespace Hiravir.Core.Accounting;


/// <summary>
/// Manages company (data file) creation and switching.
/// Each company is an independent SQLite file — freely portable.
/// </summary>
public sealed class CompanyService
{
    private readonly DatabaseService _db;
    private readonly LedgerTreeService _ledgerTree;
    private readonly StockTreeService  _stockTree;

    public Company? ActiveCompany { get; private set; }

    public CompanyService(DatabaseService db, LedgerTreeService ledgerTree, StockTreeService stockTree)
    {
        _db = db;
        _ledgerTree = ledgerTree;
        _stockTree  = stockTree;
    }

    public async Task<Company> CreateCompanyAsync(string name, string currencySymbol,
        DateOnly fiscalStart, DateOnly fiscalEnd)
    {
        var profilePath = Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments);
        var companyDir = Path.Combine(profilePath, "Hiravir", "Companies");
        Directory.CreateDirectory(companyDir);

        var safeName = string.Concat(name.Split(Path.GetInvalidFileNameChars()));
        var dbPath = Path.Combine(companyDir, $"{safeName}.hirdb");

        await _db.InitializeAsync(dbPath);
        await _db.SeedDefaultChartOfAccountsAsync();

        ActiveCompany = new Company(0, name, currencySymbol, fiscalStart, fiscalEnd, dbPath);
        await _ledgerTree.LoadAsync();
        await _ledgerTree.RecomputeAllBalancesAsync();
        await _stockTree.InitializeAsync(_db);

        return ActiveCompany;
    }

    public async Task<Company> OpenCompanyAsync(string dbPath)
    {
        await _db.InitializeAsync(dbPath);
        var meta = await _db.GetCompanyMetaAsync();
        ActiveCompany = meta;
        await _ledgerTree.LoadAsync();
        await _ledgerTree.RecomputeAllBalancesAsync();
        await _stockTree.InitializeAsync(_db);
        return ActiveCompany!;
    }

    /// <summary>Exposes the underlying DatabaseService for operations that need it (e.g. backup).</summary>
    public DatabaseService GetDatabaseService() => _db;

    /// <summary>Exposes the StockTreeService for inventory operations.</summary>
    public StockTreeService GetStockTree() => _stockTree;

    public IReadOnlyList<string> ListCompanyFiles()
    {
        var dir = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.MyDocuments),
            "Hiravir", "Companies");
        return Directory.Exists(dir)
            ? Directory.GetFiles(dir, "*.hirdb").ToList()
            : Array.Empty<string>();
    }
}
