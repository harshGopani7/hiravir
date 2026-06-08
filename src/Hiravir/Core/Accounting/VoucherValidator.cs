using Hiravir.Core.Models;

namespace Hiravir.Core.Accounting;

/// <summary>
/// Validates double-entry balance integrity before any journal is persisted.
/// Uses decimal arithmetic — floating-point types are strictly prohibited.
/// </summary>
public sealed class VoucherValidator
{
    public ValidationResult Validate(Voucher voucher)
    {
        if (voucher.Lines.Count < 2)
            return ValidationResult.Fail("A voucher must contain at least two journal lines.");

        if (!VerifyDoubleEntryBalance(voucher.Lines))
            return ValidationResult.Fail("Voucher does not balance: total debits must equal total credits.");

        foreach (var line in voucher.Lines)
        {
            if (line.DebitAmount < 0m || line.CreditAmount < 0m)
                return ValidationResult.Fail($"Negative amounts are not permitted (LedgerId={line.LedgerId}).");

            if (line.DebitAmount > 0m && line.CreditAmount > 0m)
                return ValidationResult.Fail($"A single line cannot have both debit and credit (LedgerId={line.LedgerId}).");

            if (line.DebitAmount == 0m && line.CreditAmount == 0m)
                return ValidationResult.Fail($"A journal line cannot have zero debit and zero credit (LedgerId={line.LedgerId}).");

            if (line.LedgerId <= 0)
                return ValidationResult.Fail("All journal lines must reference a valid ledger.");
        }

        if (voucher.Date == default)
            return ValidationResult.Fail("Voucher date is required.");

        return ValidationResult.Pass();
    }

    public bool VerifyDoubleEntryBalance(IEnumerable<JournalLineItem> lines)
    {
        decimal cumulativeDebits = 0m;
        decimal cumulativeCredits = 0m;

        foreach (var line in lines)
        {
            cumulativeDebits += line.DebitAmount;
            cumulativeCredits += line.CreditAmount;
        }

        return (cumulativeDebits - cumulativeCredits) == 0m;
    }
}

public sealed class ValidationResult
{
    public bool IsValid { get; private init; }
    public string? ErrorMessage { get; private init; }

    public static ValidationResult Pass() => new() { IsValid = true };
    public static ValidationResult Fail(string msg) => new() { IsValid = false, ErrorMessage = msg };
}
