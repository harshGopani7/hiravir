using Microsoft.Data.Sqlite;
using Hiravir.Core.Models;
using System.Text.Json;

namespace Hiravir.Core.Data;

/// <summary>
/// Embedded SQLite data layer.
/// WAL mode + NORMAL synchronous = maximum write throughput with crash safety.
/// Decimal money values stored as INTEGER (micro-units, 6 decimal places).
/// </summary>
public sealed class DatabaseService : IAsyncDisposable
{
    private SqliteConnection? _conn;

    private const long DECIMAL_SCALE = 1_000_000L; // 6 decimal places

    // ── Connection Management ───────────────────────────────────────────────

    public async Task InitializeAsync(string dbPath)
    {
        if (_conn is not null)
        {
            await _conn.CloseAsync();
            await _conn.DisposeAsync();
        }

        _conn = new SqliteConnection($"Data Source={dbPath};Mode=ReadWriteCreate;Cache=Shared");
        await _conn.OpenAsync();

        await ExecuteAsync("PRAGMA journal_mode=WAL;");
        await ExecuteAsync("PRAGMA synchronous=NORMAL;");
        await ExecuteAsync("PRAGMA cache_size=-32768;"); // 32 MB cache
        await ExecuteAsync("PRAGMA temp_store=MEMORY;");
        await ExecuteAsync("PRAGMA foreign_keys=ON;");

        await CreateSchemaAsync();
    }

    // Keep file unlocked when idle — WAL mode achieves this naturally
    public async ValueTask DisposeAsync()
    {
        if (_conn is not null)
        {
            await _conn.CloseAsync();
            await _conn.DisposeAsync();
        }
    }

    // ── Schema ──────────────────────────────────────────────────────────────

    private async Task CreateSchemaAsync()
    {
        await ExecuteAsync(@"
            CREATE TABLE IF NOT EXISTS company_meta (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS ledgers (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER REFERENCES ledgers(id),
                name      TEXT NOT NULL,
                grp       INTEGER NOT NULL,  -- maps to LedgerGroup enum
                is_group  INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_ledgers_parent ON ledgers(parent_id);

            CREATE TABLE IF NOT EXISTS vouchers (
                id             INTEGER PRIMARY KEY AUTOINCREMENT,
                type           INTEGER NOT NULL,
                date           TEXT NOT NULL,  -- ISO-8601 YYYY-MM-DD
                voucher_number TEXT NOT NULL,
                narration      TEXT,
                flexi_fields   TEXT NOT NULL DEFAULT '{}'  -- JSON
            );
            CREATE INDEX IF NOT EXISTS idx_vouchers_date ON vouchers(date);
            CREATE INDEX IF NOT EXISTS idx_vouchers_type ON vouchers(type);

            -- Phase 6 migration: add cancellation flag (safe to run on existing DBs)
            ALTER TABLE vouchers ADD COLUMN IF NOT EXISTS is_cancelled INTEGER NOT NULL DEFAULT 0;

            -- Phase 9 migration: add bill-wise tracking flag to ledgers
            ALTER TABLE ledgers ADD COLUMN IF NOT EXISTS maintain_bill_wise INTEGER NOT NULL DEFAULT 0;

            CREATE TABLE IF NOT EXISTS journal_lines (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                voucher_id  INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
                ledger_id   INTEGER NOT NULL REFERENCES ledgers(id),
                debit_amt   INTEGER NOT NULL DEFAULT 0,  -- micro-units (decimal * 1_000_000)
                credit_amt  INTEGER NOT NULL DEFAULT 0,
                narration   TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_jl_voucher ON journal_lines(voucher_id);
            CREATE INDEX IF NOT EXISTS idx_jl_ledger  ON journal_lines(ledger_id);

            -- Phase 9: bill allocations table
            CREATE TABLE IF NOT EXISTS bill_allocations (
                id               INTEGER PRIMARY KEY AUTOINCREMENT,
                journal_line_id  INTEGER NOT NULL REFERENCES journal_lines(id) ON DELETE CASCADE,
                ref_type         TEXT NOT NULL,   -- 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account'
                ref_name         TEXT NOT NULL,
                amount           INTEGER NOT NULL  -- micro-units
            );
            CREATE INDEX IF NOT EXISTS idx_ba_line ON bill_allocations(journal_line_id);
            CREATE INDEX IF NOT EXISTS idx_ba_ref  ON bill_allocations(ref_name);

            -- Phase 11: immutable audit trail
            CREATE TABLE IF NOT EXISTS edit_logs (
                id             TEXT PRIMARY KEY,       -- GUID
                voucher_id     INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
                action_type    TEXT NOT NULL,           -- Created|Altered|Cancelled|Deleted
                timestamp      INTEGER NOT NULL,        -- Unix ms UTC
                previous_state TEXT                    -- JSON snapshot of prior Voucher (NULL for Created)
            );
            CREATE INDEX IF NOT EXISTS idx_el_voucher ON edit_logs(voucher_id);
            CREATE INDEX IF NOT EXISTS idx_el_ts      ON edit_logs(timestamp);

            -- Phase 10: inventory tables
            CREATE TABLE IF NOT EXISTS stock_groups (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                parent_id INTEGER REFERENCES stock_groups(id),
                name      TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_sg_parent ON stock_groups(parent_id);

            CREATE TABLE IF NOT EXISTS stock_items (
                id              INTEGER PRIMARY KEY AUTOINCREMENT,
                group_id        INTEGER REFERENCES stock_groups(id),
                name            TEXT NOT NULL,
                unit_of_measure TEXT NOT NULL DEFAULT 'Nos'
            );
            CREATE INDEX IF NOT EXISTS idx_si_group ON stock_items(group_id);

            CREATE TABLE IF NOT EXISTS inventory_entries (
                id            INTEGER PRIMARY KEY AUTOINCREMENT,
                voucher_id    INTEGER NOT NULL REFERENCES vouchers(id) ON DELETE CASCADE,
                stock_item_id INTEGER NOT NULL REFERENCES stock_items(id),
                quantity      INTEGER NOT NULL,   -- micro-units
                rate          INTEGER NOT NULL,   -- micro-units per unit
                amount        INTEGER NOT NULL,   -- micro-units
                is_inward     INTEGER NOT NULL DEFAULT 0
            );
            CREATE INDEX IF NOT EXISTS idx_ie_voucher ON inventory_entries(voucher_id);
            CREATE INDEX IF NOT EXISTS idx_ie_item    ON inventory_entries(stock_item_id);

            -- Spec-required view aliases
            CREATE VIEW IF NOT EXISTS journal_entries AS
                SELECT jl.id,
                       jl.voucher_id,
                       v.date,
                       v.type           AS voucher_type,
                       v.voucher_number,
                       jl.ledger_id,
                       l.name           AS ledger_name,
                       jl.debit_amt,
                       jl.credit_amt,
                       jl.narration
                FROM   journal_lines jl
                JOIN   vouchers v ON v.id = jl.voucher_id
                JOIN   ledgers  l ON l.id = jl.ledger_id;

            CREATE VIEW IF NOT EXISTS account_groups AS
                SELECT id,
                       parent_id,
                       name,
                       grp              AS group_code,
                       CASE grp
                           WHEN 0 THEN 'Assets'
                           WHEN 1 THEN 'Liabilities'
                           WHEN 2 THEN 'Capital'
                           WHEN 3 THEN 'Income'
                           WHEN 4 THEN 'Expenses'
                       END              AS group_name,
                       is_group
                FROM   ledgers
                WHERE  is_group = 1;
        ");
    }

    // ── Company Meta ────────────────────────────────────────────────────────

    public async Task SaveCompanyMetaAsync(Company c)
    {
        await ExecuteAsync("INSERT OR REPLACE INTO company_meta VALUES ('name', @v);",
            ("@v", c.Name));
        await ExecuteAsync("INSERT OR REPLACE INTO company_meta VALUES ('currency', @v);",
            ("@v", c.CurrencySymbol));
        await ExecuteAsync("INSERT OR REPLACE INTO company_meta VALUES ('fy_start', @v);",
            ("@v", c.FiscalYearStart.ToString("O")));
        await ExecuteAsync("INSERT OR REPLACE INTO company_meta VALUES ('fy_end', @v);",
            ("@v", c.FiscalYearEnd.ToString("O")));
    }

    public async Task<Company?> GetCompanyMetaAsync()
    {
        var meta = new Dictionary<string, string>();
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = "SELECT key, value FROM company_meta;";
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            meta[r.GetString(0)] = r.GetString(1);

        if (!meta.TryGetValue("name", out var name)) return null;
        return new Company(
            0,
            name,
            meta.GetValueOrDefault("currency", "₹"),
            DateOnly.Parse(meta.GetValueOrDefault("fy_start", "2024-04-01")!),
            DateOnly.Parse(meta.GetValueOrDefault("fy_end", "2025-03-31")!),
            _conn.DataSource ?? string.Empty
        );
    }

    // ── Ledgers ─────────────────────────────────────────────────────────────

    public async Task<List<Ledger>> GetAllLedgersAsync()
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = "SELECT id, parent_id, name, grp, is_group, maintain_bill_wise FROM ledgers ORDER BY id;";
        using var r = await cmd.ExecuteReaderAsync();
        var list = new List<Ledger>();
        while (await r.ReadAsync())
        {
            list.Add(new Ledger
            {
                Id = r.GetInt32(0),
                ParentId = r.IsDBNull(1) ? null : r.GetInt32(1),
                Name = r.GetString(2),
                Group = (LedgerGroup)r.GetInt32(3),
                IsGroup = r.GetInt32(4) == 1,
                MaintainBillWise = r.GetInt32(5) == 1
            });
        }
        return list;
    }

    public async Task<int> InsertLedgerAsync(Ledger l)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO ledgers (parent_id, name, grp, is_group, maintain_bill_wise)
            VALUES (@pid, @name, @grp, @ig, @mbw);
            SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("@pid", l.ParentId.HasValue ? l.ParentId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@name", l.Name);
        cmd.Parameters.AddWithValue("@grp", (int)l.Group);
        cmd.Parameters.AddWithValue("@ig", l.IsGroup ? 1 : 0);
        cmd.Parameters.AddWithValue("@mbw", l.MaintainBillWise ? 1 : 0);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    public async Task<Dictionary<int, decimal>> GetAllLedgerBalancesAsync()
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT ledger_id,
                   SUM(debit_amt)  AS total_debit,
                   SUM(credit_amt) AS total_credit
            FROM journal_lines
            GROUP BY ledger_id;";
        using var r = await cmd.ExecuteReaderAsync();
        var result = new Dictionary<int, decimal>();
        while (await r.ReadAsync())
        {
            var id = r.GetInt32(0);
            var debit = FromMicro(r.GetInt64(1));
            var credit = FromMicro(r.GetInt64(2));
            result[id] = debit - credit; // raw net; tree service applies group logic
        }
        return result;
    }

    // ── Vouchers ────────────────────────────────────────────────────────────

    public async Task<Voucher> InsertVoucherAsync(Voucher v)
    {
        using var tx = await _conn!.BeginTransactionAsync();
        try
        {
            using var cmd = _conn.CreateCommand();
            cmd.Transaction = (SqliteTransaction)tx;
            cmd.CommandText = @"
                INSERT INTO vouchers (type, date, voucher_number, narration, flexi_fields)
                VALUES (@type, @date, @vno, @nar, @ff);
                SELECT last_insert_rowid();";
            cmd.Parameters.AddWithValue("@type", (int)v.Type);
            cmd.Parameters.AddWithValue("@date", v.Date.ToString("O"));
            cmd.Parameters.AddWithValue("@vno", v.VoucherNumber);
            cmd.Parameters.AddWithValue("@nar", v.Narration ?? (object)DBNull.Value);
            cmd.Parameters.AddWithValue("@ff", JsonSerializer.Serialize(v.FlexiFields));

            var voucherId = Convert.ToInt32(await cmd.ExecuteScalarAsync());

            foreach (var line in v.Lines)
            {
                using var lCmd = _conn.CreateCommand();
                lCmd.Transaction = (SqliteTransaction)tx;
                lCmd.CommandText = @"
                    INSERT INTO journal_lines (voucher_id, ledger_id, debit_amt, credit_amt, narration)
                    VALUES (@vid, @lid, @da, @ca, @nar);
                    SELECT last_insert_rowid();";
                lCmd.Parameters.AddWithValue("@vid", voucherId);
                lCmd.Parameters.AddWithValue("@lid", line.LedgerId);
                lCmd.Parameters.AddWithValue("@da", ToMicro(line.DebitAmount));
                lCmd.Parameters.AddWithValue("@ca", ToMicro(line.CreditAmount));
                lCmd.Parameters.AddWithValue("@nar", line.Narration ?? (object)DBNull.Value);
                var lineId = Convert.ToInt32(await lCmd.ExecuteScalarAsync());
                line.Id = lineId;
                line.VoucherId = voucherId;

                foreach (var ba in line.BillAllocations)
                {
                    using var baCmd = _conn.CreateCommand();
                    baCmd.Transaction = (SqliteTransaction)tx;
                    baCmd.CommandText = @"
                        INSERT INTO bill_allocations (journal_line_id, ref_type, ref_name, amount)
                        VALUES (@jlid, @rt, @rn, @amt);
                        SELECT last_insert_rowid();";
                    baCmd.Parameters.AddWithValue("@jlid", lineId);
                    baCmd.Parameters.AddWithValue("@rt",   ba.RefType);
                    baCmd.Parameters.AddWithValue("@rn",   ba.RefName);
                    baCmd.Parameters.AddWithValue("@amt",  ToMicro(ba.Amount));
                    ba.Id = Convert.ToInt32(await baCmd.ExecuteScalarAsync());
                    ba.JournalLineId = lineId;
                }
            }

            // ④ Insert inventory entries if present
            foreach (var ie in v.InventoryEntries)
            {
                using var ieCmd = _conn.CreateCommand();
                ieCmd.Transaction = (SqliteTransaction)tx;
                ieCmd.CommandText = @"
                    INSERT INTO inventory_entries (voucher_id, stock_item_id, quantity, rate, amount, is_inward)
                    VALUES (@vid, @siid, @qty, @rate, @amt, @iw);
                    SELECT last_insert_rowid();";
                ieCmd.Parameters.AddWithValue("@vid",  voucherId);
                ieCmd.Parameters.AddWithValue("@siid", ie.StockItemId);
                ieCmd.Parameters.AddWithValue("@qty",  ToMicro(ie.Quantity));
                ieCmd.Parameters.AddWithValue("@rate", ToMicro(ie.Rate));
                ieCmd.Parameters.AddWithValue("@amt",  ToMicro(ie.Amount));
                ieCmd.Parameters.AddWithValue("@iw",   ie.IsInward ? 1 : 0);
                ie.Id        = Convert.ToInt32(await ieCmd.ExecuteScalarAsync());
                ie.VoucherId = voucherId;
            }

            // ⑥ Audit log — Created (no previous state)
            await InsertEditLogAsync((SqliteTransaction)tx, new EditLogEntry
            {
                Id          = Guid.NewGuid().ToString(),
                VoucherId   = voucherId,
                ActionType  = "Created",
                Timestamp   = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                PreviousState = null
            });

            await tx.CommitAsync();
            return v with { Id = voucherId };
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    public async Task<List<Voucher>> GetVouchersAsync(DateOnly from, DateOnly to, VoucherType? type)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT v.id, v.type, v.date, v.voucher_number, v.narration, v.flexi_fields,
                   jl.id, jl.ledger_id, jl.debit_amt, jl.credit_amt, jl.narration,
                   l.name, v.is_cancelled
            FROM vouchers v
            LEFT JOIN journal_lines jl ON jl.voucher_id = v.id
            LEFT JOIN ledgers l ON l.id = jl.ledger_id
            WHERE v.date >= @from AND v.date <= @to"
            + (type.HasValue ? " AND v.type = @type" : "") +
            @" ORDER BY v.date, v.id, jl.id;";

        cmd.Parameters.AddWithValue("@from", from.ToString("O"));
        cmd.Parameters.AddWithValue("@to", to.ToString("O"));
        if (type.HasValue) cmd.Parameters.AddWithValue("@type", (int)type.Value);

        using var r = await cmd.ExecuteReaderAsync();
        return MapVouchers(r);
    }

    public async Task<Voucher?> GetVoucherByIdAsync(int id)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT v.id, v.type, v.date, v.voucher_number, v.narration, v.flexi_fields,
                   jl.id, jl.ledger_id, jl.debit_amt, jl.credit_amt, jl.narration,
                   l.name, v.is_cancelled
            FROM vouchers v
            LEFT JOIN journal_lines jl ON jl.voucher_id = v.id
            LEFT JOIN ledgers l ON l.id = jl.ledger_id
            WHERE v.id = @id ORDER BY jl.id;";
        cmd.Parameters.AddWithValue("@id", id);
        using var r = await cmd.ExecuteReaderAsync();
        return MapVouchers(r).FirstOrDefault();
    }

    /// <summary>
    /// Cancels a voucher: sets is_cancelled=1 and zeroes all journal_line amounts.
    /// The voucher row is preserved so the voucher number is not lost from audit trails.
    /// Returns the original lines (before zeroing) so the caller can reverse tree deltas.
    /// </summary>
    public async Task<List<JournalLineItem>> CancelVoucherAsync(int id)
    {
        // Load original lines so service layer can reverse in-memory deltas
        var voucher = await GetVoucherByIdAsync(id);
        if (voucher is null) throw new InvalidOperationException($"Voucher {id} not found.");
        var originalLines = voucher.Lines.ToList();

        var prevJson = JsonSerializer.Serialize(voucher, AppJsonContext.Default.Voucher);

        using var tx = await _conn!.BeginTransactionAsync();
        try
        {
            using var flagCmd = _conn.CreateCommand();
            flagCmd.Transaction = (SqliteTransaction)tx;
            flagCmd.CommandText = "UPDATE vouchers SET is_cancelled = 1 WHERE id = @id;";
            flagCmd.Parameters.AddWithValue("@id", id);
            await flagCmd.ExecuteNonQueryAsync();

            using var zeroCmd = _conn.CreateCommand();
            zeroCmd.Transaction = (SqliteTransaction)tx;
            zeroCmd.CommandText = "UPDATE journal_lines SET debit_amt = 0, credit_amt = 0 WHERE voucher_id = @id;";
            zeroCmd.Parameters.AddWithValue("@id", id);
            await zeroCmd.ExecuteNonQueryAsync();

            // Audit log — Cancelled
            await InsertEditLogAsync((SqliteTransaction)tx, new EditLogEntry
            {
                Id            = Guid.NewGuid().ToString(),
                VoucherId     = id,
                ActionType    = "Cancelled",
                Timestamp     = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                PreviousState = prevJson
            });

            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
        return originalLines;
    }

    public async Task DeleteVoucherAsync(int id, string? previousStateJson = null)
    {
        using var tx = await _conn!.BeginTransactionAsync();
        try
        {
            // Audit log — Deleted (before cascade removes the row)
            await InsertEditLogAsync((SqliteTransaction)tx, new EditLogEntry
            {
                Id            = Guid.NewGuid().ToString(),
                VoucherId     = id,
                ActionType    = "Deleted",
                Timestamp     = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                PreviousState = previousStateJson
            });

            using var cmd = _conn!.CreateCommand();
            cmd.Transaction = (SqliteTransaction)tx;
            cmd.CommandText = "DELETE FROM vouchers WHERE id = @id;";
            cmd.Parameters.AddWithValue("@id", id);
            await cmd.ExecuteNonQueryAsync();

            await tx.CommitAsync();
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    /// <summary>
    /// Creates a WAL-safe atomic snapshot of the live database using SQLite's
    /// VACUUM INTO command. Unlike File.Copy, this works even with a live WAL file,
    /// produces a fully defragmented single-file backup, and does not block readers.
    /// </summary>
    public async Task CreateBackupAsync(string destinationFilePath)
    {
        if (_conn is null) throw new InvalidOperationException("No database open.");
        // Delete stale destination first — VACUUM INTO fails if file already exists
        if (File.Exists(destinationFilePath))
            File.Delete(destinationFilePath);

        using var cmd = _conn.CreateCommand();
        cmd.CommandText = "VACUUM INTO @dest;";
        cmd.Parameters.AddWithValue("@dest", destinationFilePath);
        await cmd.ExecuteNonQueryAsync();
    }

    /// <summary>
    /// Restores a backup by replacing the active database file.
    /// CRITICAL: The connection must be closed and all pools cleared before
    /// overwriting the file, otherwise Windows keeps a file lock on the DB.
    /// After the file swap, <paramref name="reinitialize"/> is called so the
    /// LedgerTreeService and in-memory state are fully rebuilt from the restored data.
    /// </summary>
    public async Task RestoreBackupAsync(string sourceFilePath, string activeDbPath, Func<Task> reinitialize)
    {
        // ① Close the live connection so SQLite releases the file handle
        if (_conn is not null)
        {
            await _conn.CloseAsync();
            await _conn.DisposeAsync();
            _conn = null;
        }

        // ② Drop all pooled connections (Microsoft.Data.Sqlite connection pooling)
        SqliteConnection.ClearAllPools();

        // ③ Overwrite the active DB with the backup file
        File.Copy(sourceFilePath, activeDbPath, overwrite: true);

        // ④ Also clear any stale WAL / SHM side-car files
        foreach (var ext in new[] { "-wal", "-shm" })
        {
            var sidecar = activeDbPath + ext;
            if (File.Exists(sidecar)) File.Delete(sidecar);
        }

        // ⑤ Re-open and rebuild in-memory state
        await reinitialize();
    }

    /// <summary>
    /// Returns the raw net (debit − credit) for a ledger from all journal lines
    /// dated strictly before <paramref name="before"/>. Used for opening balance.
    /// </summary>
    public async Task<decimal> GetLedgerBalanceBeforeDateAsync(int ledgerId, DateOnly before)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT COALESCE(SUM(jl.debit_amt),0) - COALESCE(SUM(jl.credit_amt),0)
            FROM   journal_lines jl
            JOIN   vouchers v ON v.id = jl.voucher_id
            WHERE  jl.ledger_id = @lid
              AND  v.date < @before;";
        cmd.Parameters.AddWithValue("@lid",    ledgerId);
        cmd.Parameters.AddWithValue("@before", before.ToString("O"));
        var raw = await cmd.ExecuteScalarAsync();
        return raw is DBNull or null ? 0m : FromMicro(Convert.ToInt64(raw));
    }

    /// <summary>
    /// Returns every journal line that touches <paramref name="ledgerId"/>,
    /// ordered chronologically (date then voucher id then line id).
    /// Cancelled vouchers are included with IsCancelled=true and amounts zeroed.
    /// </summary>
    public async Task<List<LedgerStatementLine>> GetLedgerStatementAsync(
        int ledgerId, DateOnly from, DateOnly to)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT v.id, v.date, v.type, v.voucher_number, v.narration,
                   jl.id, jl.debit_amt, jl.credit_amt, jl.narration, v.is_cancelled
            FROM   journal_lines jl
            JOIN   vouchers v ON v.id = jl.voucher_id
            WHERE  jl.ledger_id = @lid
              AND  v.date >= @from
              AND  v.date <= @to
            ORDER  BY v.date, v.id, jl.id;";
        cmd.Parameters.AddWithValue("@lid",  ledgerId);
        cmd.Parameters.AddWithValue("@from", from.ToString("O"));
        cmd.Parameters.AddWithValue("@to",   to.ToString("O"));

        var lines = new List<LedgerStatementLine>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            var cancelled = r.GetInt32(9) == 1;
            lines.Add(new LedgerStatementLine
            {
                VoucherId     = r.GetInt32(0),
                Date          = r.GetString(1),
                VoucherType   = ((VoucherType)r.GetInt32(2)).ToString(),
                VoucherNumber = r.GetString(3),
                Narration     = r.IsDBNull(4) ? string.Empty : r.GetString(4),
                LineId        = r.GetInt32(5),
                Debit         = cancelled ? 0m : FromMicro(r.GetInt64(6)),
                Credit        = cancelled ? 0m : FromMicro(r.GetInt64(7)),
                LineNarration = r.IsDBNull(8) ? string.Empty : r.GetString(8),
                IsCancelled   = cancelled,
            });
        }
        return lines;
    }

    /// <summary>
    /// Atomically replaces the journal lines of an existing voucher and updates its header.
    /// The caller (VoucherService) is responsible for reversing/applying in-memory tree deltas.
    /// </summary>
    public async Task<Voucher> UpdateVoucherAsync(Voucher v, string? previousStateJson = null)
    {
        using var tx = await _conn!.BeginTransactionAsync();
        try
        {
            // ① Update voucher header
            using var hCmd = _conn.CreateCommand();
            hCmd.Transaction = (SqliteTransaction)tx;
            hCmd.CommandText = @"
                UPDATE vouchers
                SET type = @type, date = @date, voucher_number = @vno,
                    narration = @nar, flexi_fields = @ff
                WHERE id = @id;";
            hCmd.Parameters.AddWithValue("@type", (int)v.Type);
            hCmd.Parameters.AddWithValue("@date", v.Date.ToString("O"));
            hCmd.Parameters.AddWithValue("@vno",  v.VoucherNumber);
            hCmd.Parameters.AddWithValue("@nar",  v.Narration ?? (object)DBNull.Value);
            hCmd.Parameters.AddWithValue("@ff",   JsonSerializer.Serialize(v.FlexiFields));
            hCmd.Parameters.AddWithValue("@id",   v.Id);
            await hCmd.ExecuteNonQueryAsync();

            // ② Delete old journal lines (ON DELETE CASCADE would also work, but explicit is clearer)
            using var dCmd = _conn.CreateCommand();
            dCmd.Transaction = (SqliteTransaction)tx;
            dCmd.CommandText = "DELETE FROM journal_lines WHERE voucher_id = @id;";
            dCmd.Parameters.AddWithValue("@id", v.Id);
            await dCmd.ExecuteNonQueryAsync();

            // ③ Insert new journal lines (bill_allocations cascade-deleted with journal_lines above)
            foreach (var line in v.Lines)
            {
                using var lCmd = _conn.CreateCommand();
                lCmd.Transaction = (SqliteTransaction)tx;
                lCmd.CommandText = @"
                    INSERT INTO journal_lines (voucher_id, ledger_id, debit_amt, credit_amt, narration)
                    VALUES (@vid, @lid, @da, @ca, @nar);
                    SELECT last_insert_rowid();";
                lCmd.Parameters.AddWithValue("@vid", v.Id);
                lCmd.Parameters.AddWithValue("@lid", line.LedgerId);
                lCmd.Parameters.AddWithValue("@da",  ToMicro(line.DebitAmount));
                lCmd.Parameters.AddWithValue("@ca",  ToMicro(line.CreditAmount));
                lCmd.Parameters.AddWithValue("@nar", line.Narration ?? (object)DBNull.Value);
                var lineId = Convert.ToInt32(await lCmd.ExecuteScalarAsync());
                line.Id = lineId;
                line.VoucherId = v.Id;

                foreach (var ba in line.BillAllocations)
                {
                    using var baCmd = _conn.CreateCommand();
                    baCmd.Transaction = (SqliteTransaction)tx;
                    baCmd.CommandText = @"
                        INSERT INTO bill_allocations (journal_line_id, ref_type, ref_name, amount)
                        VALUES (@jlid, @rt, @rn, @amt);
                        SELECT last_insert_rowid();";
                    baCmd.Parameters.AddWithValue("@jlid", lineId);
                    baCmd.Parameters.AddWithValue("@rt",   ba.RefType);
                    baCmd.Parameters.AddWithValue("@rn",   ba.RefName);
                    baCmd.Parameters.AddWithValue("@amt",  ToMicro(ba.Amount));
                    ba.Id = Convert.ToInt32(await baCmd.ExecuteScalarAsync());
                    ba.JournalLineId = lineId;
                }
            }

            // ④ Re-insert inventory entries (cascade-deleted with journal_lines above)
            foreach (var ie in v.InventoryEntries)
            {
                using var ieCmd = _conn.CreateCommand();
                ieCmd.Transaction = (SqliteTransaction)tx;
                ieCmd.CommandText = @"
                    INSERT INTO inventory_entries (voucher_id, stock_item_id, quantity, rate, amount, is_inward)
                    VALUES (@vid, @siid, @qty, @rate, @amt, @iw);
                    SELECT last_insert_rowid();";
                ieCmd.Parameters.AddWithValue("@vid",  v.Id);
                ieCmd.Parameters.AddWithValue("@siid", ie.StockItemId);
                ieCmd.Parameters.AddWithValue("@qty",  ToMicro(ie.Quantity));
                ieCmd.Parameters.AddWithValue("@rate", ToMicro(ie.Rate));
                ieCmd.Parameters.AddWithValue("@amt",  ToMicro(ie.Amount));
                ieCmd.Parameters.AddWithValue("@iw",   ie.IsInward ? 1 : 0);
                ie.Id        = Convert.ToInt32(await ieCmd.ExecuteScalarAsync());
                ie.VoucherId = v.Id;
            }

            // ⑥ Audit log — Altered
            await InsertEditLogAsync((SqliteTransaction)tx, new EditLogEntry
            {
                Id            = Guid.NewGuid().ToString(),
                VoucherId     = v.Id,
                ActionType    = "Altered",
                Timestamp     = DateTimeOffset.UtcNow.ToUnixTimeMilliseconds(),
                PreviousState = previousStateJson
            });

            await tx.CommitAsync();
            return v;
        }
        catch
        {
            await tx.RollbackAsync();
            throw;
        }
    }

    // ── Audit / Edit Log ───────────────────────────────────────────────────

    /// <summary>Append-only insert of a single audit log entry (must be called inside an open transaction).</summary>
    public async Task InsertEditLogAsync(SqliteTransaction tx, EditLogEntry entry)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText = @"
            INSERT INTO edit_logs (id, voucher_id, action_type, timestamp, previous_state)
            VALUES (@id, @vid, @at, @ts, @ps);";
        cmd.Parameters.AddWithValue("@id",  entry.Id);
        cmd.Parameters.AddWithValue("@vid", entry.VoucherId);
        cmd.Parameters.AddWithValue("@at",  entry.ActionType);
        cmd.Parameters.AddWithValue("@ts",  entry.Timestamp);
        cmd.Parameters.AddWithValue("@ps",  entry.PreviousState ?? (object)DBNull.Value);
        await cmd.ExecuteNonQueryAsync();
    }

    public async Task<List<EditLogEntry>> GetEditLogAsync(int voucherId)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT id, voucher_id, action_type, timestamp, previous_state
            FROM edit_logs
            WHERE voucher_id = @vid
            ORDER BY timestamp DESC;";
        cmd.Parameters.AddWithValue("@vid", voucherId);
        var list = new List<EditLogEntry>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new EditLogEntry
            {
                Id            = r.GetString(0),
                VoucherId     = r.GetInt32(1),
                ActionType    = r.GetString(2),
                Timestamp     = r.GetInt64(3),
                PreviousState = r.IsDBNull(4) ? null : r.GetString(4)
            });
        return list;
    }

    // ── Stock Groups & Items ─────────────────────────────────────────────────

    public async Task<int> InsertStockGroupAsync(StockGroup g)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO stock_groups (parent_id, name)
            VALUES (@pid, @name);
            SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("@pid",  g.ParentId.HasValue ? g.ParentId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@name", g.Name);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    public async Task<List<StockGroup>> GetAllStockGroupsAsync()
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = "SELECT id, parent_id, name FROM stock_groups ORDER BY id;";
        var list = new List<StockGroup>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new StockGroup
            {
                Id       = r.GetInt32(0),
                ParentId = r.IsDBNull(1) ? null : r.GetInt32(1),
                Name     = r.GetString(2)
            });
        return list;
    }

    public async Task<int> InsertStockItemAsync(StockItem item)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            INSERT INTO stock_items (group_id, name, unit_of_measure)
            VALUES (@gid, @name, @uom);
            SELECT last_insert_rowid();";
        cmd.Parameters.AddWithValue("@gid",  item.GroupId.HasValue ? item.GroupId.Value : DBNull.Value);
        cmd.Parameters.AddWithValue("@name", item.Name);
        cmd.Parameters.AddWithValue("@uom",  item.UnitOfMeasure);
        return Convert.ToInt32(await cmd.ExecuteScalarAsync());
    }

    public async Task<List<StockItem>> GetAllStockItemsAsync()
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = "SELECT id, group_id, name, unit_of_measure FROM stock_items ORDER BY id;";
        var list = new List<StockItem>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new StockItem
            {
                Id            = r.GetInt32(0),
                GroupId       = r.IsDBNull(1) ? null : r.GetInt32(1),
                Name          = r.GetString(2),
                UnitOfMeasure = r.GetString(3)
            });
        return list;
    }

    public async Task<List<InventoryEntry>> GetAllInventoryEntriesAsync()
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT ie.id, ie.voucher_id, ie.stock_item_id,
                   si.name, ie.quantity, ie.rate, ie.amount, ie.is_inward
            FROM inventory_entries ie
            JOIN stock_items si ON si.id = ie.stock_item_id
            JOIN vouchers    v  ON v.id  = ie.voucher_id
            WHERE v.is_cancelled = 0
            ORDER BY ie.id;";
        var list = new List<InventoryEntry>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new InventoryEntry
            {
                Id          = r.GetInt32(0),
                VoucherId   = r.GetInt32(1),
                StockItemId = r.GetInt32(2),
                ItemName    = r.GetString(3),
                Quantity    = FromMicro(r.GetInt64(4)),
                Rate        = FromMicro(r.GetInt64(5)),
                Amount      = FromMicro(r.GetInt64(6)),
                IsInward    = r.GetInt32(7) == 1
            });
        return list;
    }

    public async Task<List<InventoryEntry>> GetInventoryEntriesForVoucherAsync(int voucherId)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT ie.id, ie.voucher_id, ie.stock_item_id,
                   si.name, ie.quantity, ie.rate, ie.amount, ie.is_inward
            FROM inventory_entries ie
            JOIN stock_items si ON si.id = ie.stock_item_id
            WHERE ie.voucher_id = @vid
            ORDER BY ie.id;";
        cmd.Parameters.AddWithValue("@vid", voucherId);
        var list = new List<InventoryEntry>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
            list.Add(new InventoryEntry
            {
                Id          = r.GetInt32(0),
                VoucherId   = r.GetInt32(1),
                StockItemId = r.GetInt32(2),
                ItemName    = r.GetString(3),
                Quantity    = FromMicro(r.GetInt64(4)),
                Rate        = FromMicro(r.GetInt64(5)),
                Amount      = FromMicro(r.GetInt64(6)),
                IsInward    = r.GetInt32(7) == 1
            });
        return list;
    }

    // ── Seed Data ───────────────────────────────────────────────────────────

    public async Task SeedDefaultChartOfAccountsAsync()
    {
        var groups = new[]
        {
            (null as int?, "Capital Account",           LedgerGroup.Capital,      true),
            (null as int?, "Loans (Liability)",         LedgerGroup.Liabilities,  true),
            (null as int?, "Current Liabilities",       LedgerGroup.Liabilities,  true),
            (null as int?, "Fixed Assets",              LedgerGroup.Assets,       true),
            (null as int?, "Current Assets",            LedgerGroup.Assets,       true),
            (null as int?, "Bank Accounts",             LedgerGroup.Assets,       true),
            (null as int?, "Cash-in-Hand",              LedgerGroup.Assets,       true),
            (null as int?, "Sundry Debtors",            LedgerGroup.Assets,       true),
            (null as int?, "Sundry Creditors",          LedgerGroup.Liabilities,  true),
            (null as int?, "Sales Accounts",            LedgerGroup.Income,       true),
            (null as int?, "Purchase Accounts",         LedgerGroup.Expenses,     true),
            (null as int?, "Direct Expenses",           LedgerGroup.Expenses,     true),
            (null as int?, "Indirect Expenses",         LedgerGroup.Expenses,     true),
            (null as int?, "Direct Income",             LedgerGroup.Income,       true),
            (null as int?, "Indirect Income",           LedgerGroup.Income,       true),
        };

        var ids = new Dictionary<string, int>();
        foreach (var (pid, name, grp, isGrp) in groups)
        {
            var id = await InsertLedgerAsync(new Ledger
            {
                ParentId = pid,
                Name = name,
                Group = grp,
                IsGroup = isGrp
            });
            ids[name] = id;
        }

        // Seed leaf ledgers
        var leaves = new[]
        {
            (ids["Cash-in-Hand"],        "Cash",          LedgerGroup.Assets),
            (ids["Bank Accounts"],       "Primary Bank",  LedgerGroup.Assets),
            (ids["Capital Account"],     "Owner Capital", LedgerGroup.Capital),
        };
        foreach (var (pid, name, grp) in leaves)
        {
            await InsertLedgerAsync(new Ledger
            {
                ParentId = pid,
                Name = name,
                Group = grp,
                IsGroup = false
            });
        }
    }

    /// <summary>
    /// Returns all bill refs whose net allocated amount is non-zero,
    /// grouped by ledger + ref_name. Positive = receivable, Negative = payable.
    /// </summary>
    public async Task<List<OutstandingRow>> GetBillsOutstandingAsync()
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = @"
            SELECT jl.ledger_id,
                   l.name        AS ledger_name,
                   ba.ref_name,
                   SUM(CASE ba.ref_type
                       WHEN 'New Ref' THEN  ba.amount
                       WHEN 'Advance' THEN  ba.amount
                       WHEN 'Agst Ref' THEN -ba.amount
                       WHEN 'On Account' THEN ba.amount
                       ELSE 0 END)          AS net_amount
            FROM   bill_allocations ba
            JOIN   journal_lines jl ON jl.id = ba.journal_line_id
            JOIN   vouchers      v  ON v.id  = jl.voucher_id
            JOIN   ledgers       l  ON l.id  = jl.ledger_id
            WHERE  v.is_cancelled = 0
            GROUP  BY jl.ledger_id, ba.ref_name
            HAVING ABS(net_amount) > 0
            ORDER  BY l.name, ba.ref_name;";

        var rows = new List<OutstandingRow>();
        using var r = await cmd.ExecuteReaderAsync();
        while (await r.ReadAsync())
        {
            rows.Add(new OutstandingRow
            {
                LedgerId     = r.GetInt32(0),
                LedgerName   = r.GetString(1),
                RefName      = r.GetString(2),
                PendingAmount = FromMicro(r.GetInt64(3))
            });
        }
        return rows;
    }

    // ── Helpers ─────────────────────────────────────────────────────────────

    private async Task ExecuteAsync(string sql, params (string, object)[] prms)
    {
        using var cmd = _conn!.CreateCommand();
        cmd.CommandText = sql;
        foreach (var (k, v) in prms)
            cmd.Parameters.AddWithValue(k, v);
        await cmd.ExecuteNonQueryAsync();
    }

    private static long ToMicro(decimal d) => (long)(d * DECIMAL_SCALE);
    private static decimal FromMicro(long l) => (decimal)l / DECIMAL_SCALE;

    private static List<Voucher> MapVouchers(SqliteDataReader r)
    {
        var vouchers = new Dictionary<int, Voucher>();
        while (r.Read())
        {
            var vid = r.GetInt32(0);
            if (!vouchers.TryGetValue(vid, out var v))
            {
                // col 12 = is_cancelled (added in Phase 6; may be absent on old selects without it)
                var isCancelled = r.FieldCount > 12 && !r.IsDBNull(12) && r.GetInt32(12) == 1;
                v = new Voucher
                {
                    Id = vid,
                    Type = (VoucherType)r.GetInt32(1),
                    Date = DateOnly.Parse(r.GetString(2)),
                    VoucherNumber = r.GetString(3),
                    Narration = r.IsDBNull(4) ? null : r.GetString(4),
                    FlexiFields = JsonSerializer.Deserialize<Dictionary<string, object?>>(r.GetString(5))
                                  ?? new(),
                    IsCancelled = isCancelled
                };
                vouchers[vid] = v;
            }

            if (!r.IsDBNull(6))
            {
                v.Lines.Add(new JournalLineItem
                {
                    Id = r.GetInt32(6),
                    VoucherId = vid,
                    LedgerId = r.GetInt32(7),
                    DebitAmount = (decimal)r.GetInt64(8) / 1_000_000m,
                    CreditAmount = (decimal)r.GetInt64(9) / 1_000_000m,
                    Narration = r.IsDBNull(10) ? null : r.GetString(10),
                    LedgerName = r.IsDBNull(11) ? string.Empty : r.GetString(11)
                });
            }
        }
        return vouchers.Values.ToList();
    }

    public SqliteConnection? Connection => _conn;
}
