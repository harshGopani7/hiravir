/**
 * Phase 1 PoC — End-to-end interop timing screen.
 *
 * Grid layout:  4 rows × 3 columns (Ledger | Dr | Cr)
 * Enter         → moves focus one cell down (column-major order)
 * F2            → sends the 4-line double-entry voucher to C# backend,
 *                 which validates Dr==Cr, saves to SQLite WAL, and returns
 *                 a sub-millisecond timing breakdown.
 */
import { useRef, useState, useCallback, useEffect } from 'react'
import { dispatch, type PocResult } from '../bridge/interop'
import { useAppStore } from '../store/appStore'

// ── Mock 4-line balanced double-entry voucher ─────────────────────────────────
// Cash Dr 50,000 | Bank Cr 25,000 | Sales Cr 15,000 | Expenses Dr -10,000…
// Keeps it simple: 2 Dr lines + 2 Cr lines, each side sums to 60,000
const DEFAULT_ROWS: Row[] = [
  { ledgerId: 2,  ledgerName: 'Cash',         dr: '60000',  cr: ''      },
  { ledgerId: 6,  ledgerName: 'Sales',         dr: '',       cr: '40000' },
  { ledgerId: 8,  ledgerName: 'Purchases',     dr: '',       cr: '20000' },
  { ledgerId: 10, ledgerName: 'Primary Bank',  dr: '',       cr: ''      },
]

// Columns per row in the grid
const COLS = 3

interface Row {
  ledgerId: number
  ledgerName: string
  dr: string
  cr: string
}

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2 })

export function PocTest() {
  const { goBack } = useAppStore()
  const [rows, setRows] = useState<Row[]>(DEFAULT_ROWS)
  const [result, setResult] = useState<PocResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitCount, setSubmitCount] = useState(0)

  // Grid ref: cellRefs[row][col] → input element
  const cellRefs = useRef<(HTMLInputElement | null)[][]>(
    Array.from({ length: 4 }, () => Array(COLS).fill(null))
  )

  // Focus first cell on mount
  useEffect(() => {
    cellRefs.current[0][0]?.focus()
  }, [])

  // ── Cell setter ────────────────────────────────────────────────────────────
  const setCell = useCallback((r: number, field: keyof Row, val: string) => {
    setRows(prev => prev.map((row, i) => i === r ? { ...row, [field]: val } : row))
  }, [])

  // ── Enter key: move focus to next cell (column-major: down each Dr, then Cr) ──
  const handleKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    rowIdx: number,
    colIdx: number
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      // column-major order: move down through rows, then advance to next column
      const nextRow = rowIdx + 1
      const nextCol = colIdx
      if (nextRow < rows.length) {
        cellRefs.current[nextRow][nextCol]?.focus()
      } else {
        const nc = colIdx + 1
        if (nc < COLS) cellRefs.current[0][nc]?.focus()
        else cellRefs.current[0][0]?.focus()
      }
    }

    if (e.key === 'F2') {
      e.preventDefault()
      submitVoucher()
    }

    if (e.key === 'Escape') {
      e.preventDefault()
      goBack()
    }
  }, [rows])

  // ── F2 → send 4-line voucher to C# backend ────────────────────────────────
  const submitVoucher = useCallback(async () => {
    if (submitting) return
    setError(null)
    setResult(null)
    setSubmitting(true)

    const lines = rows
      .map(r => ({
        ledgerId: r.ledgerId,
        debitAmount: parseFloat(r.dr) || 0,
        creditAmount: parseFloat(r.cr) || 0,
        narration: r.ledgerName,
      }))
      .filter(l => l.debitAmount > 0 || l.creditAmount > 0)

    const totalDr = lines.reduce((s, l) => s + l.debitAmount,  0)
    const totalCr = lines.reduce((s, l) => s + l.creditAmount, 0)

    if (Math.abs(totalDr - totalCr) > 0.000001) {
      setError(`Voucher does not balance — Dr ${FMT.format(totalDr)} ≠ Cr ${FMT.format(totalCr)}`)
      setSubmitting(false)
      return
    }

    const payload = {
      type: 'Journal',
      date: new Date().toISOString().slice(0, 10),
      voucherNumber: `POC-${Date.now()}`,
      narration: 'Phase 1 PoC test voucher',
      flexiFields: {},
      lines,
    }

    const t0 = performance.now()
    const res = await dispatch<PocResult>('voucher.poc', payload)
    const rtt = performance.now() - t0

    if (res.ok && res.data) {
      setResult({ ...res.data, totalElapsedMs: Math.min(res.data.totalElapsedMs, rtt) })
      setSubmitCount(c => c + 1)
    } else {
      setError(res.error ?? 'Unknown error')
    }
    setSubmitting(false)
  }, [rows, submitting])

  const totalDr = rows.reduce((s, r) => s + (parseFloat(r.dr) || 0), 0)
  const totalCr = rows.reduce((s, r) => s + (parseFloat(r.cr) || 0), 0)
  const isBalanced = Math.abs(totalDr - totalCr) < 0.000001

  return (
    <div className="flex flex-col h-full bg-tally-bg text-tally-text font-mono text-xs">

      {/* ── Header ── */}
      <div className="tally-header shrink-0 justify-between">
        <span className="text-tally-yellow font-bold tracking-widest">
          ◈ PHASE 1 — INTEROP PROOF OF CONCEPT
        </span>
        <span className="text-tally-muted text-2xs">
          Enter = next cell  ·  F2 = submit  ·  Esc = back
        </span>
      </div>

      <div className="flex flex-1 overflow-hidden">

        {/* ── Left: Input Grid ── */}
        <div className="flex-1 flex flex-col border-r border-tally-border">

          {/* Grid header */}
          <div className="grid grid-cols-[2fr_1fr_1fr] tally-header text-2xs shrink-0 border-b border-tally-border">
            <span>Ledger Account</span>
            <span className="text-right pr-2">Debit (Dr)</span>
            <span className="text-right pr-2">Credit (Cr)</span>
          </div>

          {/* Data rows */}
          {rows.map((row, ri) => (
            <div
              key={ri}
              className="grid grid-cols-[2fr_1fr_1fr] border-b border-tally-border"
            >
              {/* Ledger name — read-only for PoC */}
              <input
                ref={el => { cellRefs.current[ri][0] = el }}
                className="tally-input px-2 py-1 border-r border-tally-border bg-tally-panel
                           focus:bg-tally-accent focus:outline-none w-full"
                value={row.ledgerName}
                readOnly
                onKeyDown={e => handleKeyDown(e, ri, 0)}
              />
              {/* Dr */}
              <input
                ref={el => { cellRefs.current[ri][1] = el }}
                type="number"
                min="0"
                step="0.01"
                className="tally-input text-right pr-2 py-1 border-r border-tally-border
                           amount-debit focus:bg-tally-accent focus:outline-none w-full"
                value={row.dr}
                onChange={e => setCell(ri, 'dr', e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => handleKeyDown(e, ri, 1)}
              />
              {/* Cr */}
              <input
                ref={el => { cellRefs.current[ri][2] = el }}
                type="number"
                min="0"
                step="0.01"
                className="tally-input text-right pr-2 py-1
                           amount-credit focus:bg-tally-accent focus:outline-none w-full"
                value={row.cr}
                onChange={e => setCell(ri, 'cr', e.target.value)}
                onFocus={e => e.target.select()}
                onKeyDown={e => handleKeyDown(e, ri, 2)}
              />
            </div>
          ))}

          {/* Totals row */}
          <div className="grid grid-cols-[2fr_1fr_1fr] border-b border-tally-border bg-tally-accent">
            <span className="px-2 py-1 text-tally-yellow font-bold">Total</span>
            <span className={`text-right pr-2 py-1 font-bold font-mono
              ${isBalanced ? 'text-tally-green' : 'text-tally-red'}`}>
              {FMT.format(totalDr)}
            </span>
            <span className={`text-right pr-2 py-1 font-bold font-mono
              ${isBalanced ? 'text-tally-green' : 'text-tally-red'}`}>
              {FMT.format(totalCr)}
            </span>
          </div>

          {/* Balance indicator */}
          <div className={`px-3 py-1 text-2xs font-bold shrink-0 ${
            isBalanced ? 'bg-tally-green text-black' : 'bg-tally-red text-white'
          }`}>
            {isBalanced ? '✓ BALANCED — Press F2 to submit' : `✗ NOT BALANCED — Diff: ${FMT.format(Math.abs(totalDr - totalCr))}`}
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-3 p-3 mt-auto">
            <button
              className={`tally-btn-primary px-8 py-1.5 text-sm
                ${(!isBalanced || submitting) ? 'opacity-40 cursor-not-allowed' : ''}`}
              disabled={!isBalanced || submitting}
              onClick={submitVoucher}
            >
              {submitting ? 'Submitting…' : '[F2] Submit via Bridge'}
            </button>
            <button className="tally-btn px-6 py-1.5" onClick={goBack}>
              [Esc] Back
            </button>
            {submitCount > 0 && (
              <span className="ml-auto text-tally-muted text-2xs">
                {submitCount} voucher{submitCount > 1 ? 's' : ''} saved this session
              </span>
            )}
          </div>
        </div>

        {/* ── Right: Results panel ── */}
        <div className="w-80 flex flex-col shrink-0 overflow-y-auto">
          <div className="tally-header text-2xs shrink-0">Bridge Timing Report</div>

          {error && (
            <div className="m-3 p-3 bg-tally-red/20 border border-tally-red text-tally-red text-2xs">
              ✗ {error}
            </div>
          )}

          {result && (
            <div className="p-3 space-y-3">
              {/* Status badge */}
              <div className={`p-2 text-center text-xs font-bold border
                ${result.balanced
                  ? 'border-tally-green text-tally-green bg-tally-green/10'
                  : 'border-tally-red text-tally-red bg-tally-red/10'}`}>
                {result.balanced ? '✓ DOUBLE-ENTRY VERIFIED' : '✗ UNBALANCED'}
              </div>

              {/* Timing breakdown */}
              <div className="border border-tally-border">
                <div className="tally-header text-2xs">Timing Breakdown</div>
                <TimingRow label="Validate (Dr==Cr)"  ms={result.validateMs}  highlight />
                <TimingRow label="SQLite WAL write"    ms={result.saveMs}      highlight />
                <TimingRow label="Total C# elapsed"    ms={result.totalElapsedMs} />
              </div>

              {/* Voucher info */}
              <div className="border border-tally-border">
                <div className="tally-header text-2xs">Saved Voucher</div>
                <InfoRow label="Voucher ID"    value={String(result.voucherId)} />
                <InfoRow label="Voucher No."   value={result.voucherNumber} />
                <InfoRow label="Lines saved"   value={String(result.lineCount)} />
                <InfoRow label="Dr total"      value={`₹ ${FMT.format(result.debitTotal)}`} />
                <InfoRow label="Cr total"      value={`₹ ${FMT.format(result.creditTotal)}`} />
              </div>

              {/* Timestamps */}
              <div className="border border-tally-border">
                <div className="tally-header text-2xs">Timestamps (UTC)</div>
                <InfoRow label="Submitted"  value={result.submitUtc.slice(11, 23)} />
                <InfoRow label="Confirmed"  value={result.confirmUtc.slice(11, 23)} />
              </div>
            </div>
          )}

          {!result && !error && (
            <div className="p-4 text-tally-muted text-2xs text-center mt-4">
              Edit the grid above and press F2 to fire the<br/>
              end-to-end interop loop.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Small presentational helpers ─────────────────────────────────────────────

function TimingRow({ label, ms, highlight }: { label: string; ms: number; highlight?: boolean }) {
  const color = ms < 1 ? 'text-tally-green' : ms < 5 ? 'text-tally-yellow' : 'text-tally-red'
  return (
    <div className={`flex justify-between px-2 py-0.5 text-2xs border-b border-tally-border
      ${highlight ? 'bg-tally-panel' : ''}`}>
      <span className="text-tally-muted">{label}</span>
      <span className={`font-bold font-mono ${color}`}>
        {ms < 1 ? `${(ms * 1000).toFixed(1)} µs` : `${ms.toFixed(3)} ms`}
      </span>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-2 py-0.5 text-2xs border-b border-tally-border">
      <span className="text-tally-muted">{label}</span>
      <span className="text-tally-text font-mono truncate max-w-[140px]">{value}</span>
    </div>
  )
}
