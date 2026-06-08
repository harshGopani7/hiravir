import { useEffect, useState, useRef, useCallback } from 'react'
import { api, type LedgerStatementLine, type LedgerStatementResult } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'
import { EditLogModal } from '../components/EditLogModal'

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const TODAY = new Date().toISOString().slice(0, 10)
const FY_START = `${new Date().getFullYear() - (new Date().getMonth() < 3 ? 1 : 0)}-04-01`

export function LedgerVouchers() {
  const { setStatus, setScreen, setEditVoucherId, drillLedgerId } = useAppStore()
  const [result, setResult]   = useState<LedgerStatementResult | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [from, setFrom] = useState(FY_START)
  const [to, setTo]     = useState(TODAY)
  const [editLogVoucher, setEditLogVoucher] = useState<{ id: number; number: string } | null>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (f: string, t: string) => {
    if (!drillLedgerId) return
    setLoading(true)
    const r = await api.report.ledgerStatement(drillLedgerId, f, t)
    if (r.ok && r.data) { setResult(r.data); setActiveIdx(0) }
    else setStatus(r.error ?? 'Failed to load statement', 'error')
    setLoading(false)
  }, [drillLedgerId, setStatus])

  useEffect(() => { load(from, to) }, [drillLedgerId])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const lines = result?.lines ?? []

  const openVoucher = useCallback((line: LedgerStatementLine) => {
    setEditVoucherId(line.voucherId)
    setScreen('voucher-entry')
  }, [setEditVoucherId, setScreen])

  const handleDelete = useCallback(async () => {
    const line = lines[activeIdx]
    if (!line) return
    if (!window.confirm(`Delete voucher ${line.voucherNumber}? This cannot be undone.`)) return
    const res = await api.voucher.delete(line.voucherId)
    if (res.ok) { setStatus('Voucher deleted', 'success'); load(from, to) }
    else setStatus(res.error ?? 'Delete failed', 'error')
  }, [lines, activeIdx, from, to, load, setStatus])

  const handleCancel = useCallback(async () => {
    const line = lines[activeIdx]
    if (!line) return
    if (line.isCancelled) { setStatus('Voucher is already cancelled', 'error'); return }
    if (!window.confirm(`Cancel voucher ${line.voucherNumber}? Amounts will be zeroed but the number is preserved.`)) return
    const res = await api.voucher.cancel(line.voucherId)
    if (res.ok) { setStatus('Voucher cancelled', 'success'); load(from, to) }
    else setStatus(res.error ?? 'Cancel failed', 'error')
  }, [lines, activeIdx, from, to, load, setStatus])

  useKeyboard((action) => {
    if (action === 'up')             setActiveIdx(i => Math.max(0, i - 1))
    if (action === 'down')           setActiveIdx(i => Math.min(lines.length - 1, i + 1))
    if (action === 'report')         load(from, to)
    if (action === 'submit' && lines[activeIdx]) openVoucher(lines[activeIdx])
    if (action === 'delete-voucher') handleDelete()
    if (action === 'cancel-voucher') handleCancel()
    if (action === 'view-edit-log' && lines[activeIdx]) {
      const line = lines[activeIdx]
      setEditLogVoucher({ id: line.voucherId, number: line.voucherNumber })
    }
  })

  if (!drillLedgerId) return (
    <div className="p-4 text-tally-muted">No ledger selected. Navigate here via Trial Balance.</div>
  )

  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="tally-header shrink-0 justify-between">
        <div className="flex items-center gap-3">
          <span>Ledger Vouchers</span>
          {result && (
            <span className="text-tally-yellow font-bold text-sm">{result.ledgerName}</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-2xs">
          <span className="text-tally-muted">From</span>
          <input type="date" className="tally-input border border-tally-border px-1"
            value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-tally-muted">To</span>
          <input type="date" className="tally-input border border-tally-border px-1"
            value={to} onChange={e => setTo(e.target.value)} />
          <button className="tally-btn px-2 py-0.5" onClick={() => load(from, to)}>Go</button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[90px_70px_90px_2fr_1fr_1fr_1fr] tally-header text-2xs shrink-0">
        <span>Date</span>
        <span>Type</span>
        <span>Vch No.</span>
        <span>Narration</span>
        <span className="text-right pr-2">Debit (Dr)</span>
        <span className="text-right pr-2">Credit (Cr)</span>
        <span className="text-right pr-2">Balance</span>
      </div>

      <div className="flex-1 overflow-y-auto">

        {/* Opening balance row */}
        {result && (
          <div className="grid grid-cols-[90px_70px_90px_2fr_1fr_1fr_1fr] tally-row text-2xs bg-tally-accent">
            <span className="text-tally-muted">{result.from}</span>
            <span></span>
            <span></span>
            <span className="text-tally-muted italic">Opening Balance</span>
            <span></span>
            <span></span>
            <span className={`text-right pr-2 font-mono font-bold ${
              result.openingBalance >= 0 ? 'amount-debit' : 'amount-credit'
            }`}>
              {FMT.format(Math.abs(result.openingBalance))}
              <span className="text-tally-muted text-2xs ml-1">
                {result.openingBalance >= 0 ? 'Dr' : 'Cr'}
              </span>
            </span>
          </div>
        )}

        {/* Transaction lines */}
        {lines.map((line, i) => {
          const isActive = i === activeIdx
          return (
            <div
              key={line.lineId}
              ref={isActive ? activeRef : undefined}
              onClick={() => { setActiveIdx(i); openVoucher(line) }}
              className={`grid grid-cols-[90px_70px_90px_2fr_1fr_1fr_1fr] tally-row text-2xs cursor-pointer
                ${isActive
                  ? 'bg-tally-highlight text-black'
                  : line.isCancelled
                    ? 'opacity-50 text-tally-muted'
                    : 'hover:bg-tally-accent'}`}
            >
              <span className="font-mono">{line.date}</span>
              <span className={isActive ? 'text-black/70' : 'text-tally-yellow'}>{line.voucherType}</span>
              <span className={`font-mono ${isActive ? 'text-black/80' : 'text-tally-blue'}`}>
                {line.voucherNumber}
              </span>
              <span className={`truncate ${line.isCancelled && !isActive ? 'line-through' : ''}`}>
                {line.isCancelled ? '** CANCELLED **' : (line.narration || line.lineNarration || '—')}
              </span>
              <span className={`text-right pr-2 font-mono ${
                isActive ? 'text-black' : line.isCancelled ? 'line-through text-tally-muted' : line.debit > 0 ? 'amount-debit' : 'text-tally-muted'
              }`}>
                {line.debit > 0 ? FMT.format(line.debit) : '-'}
              </span>
              <span className={`text-right pr-2 font-mono ${
                isActive ? 'text-black' : line.isCancelled ? 'line-through text-tally-muted' : line.credit > 0 ? 'amount-credit' : 'text-tally-muted'
              }`}>
                {line.credit > 0 ? FMT.format(line.credit) : '-'}
              </span>
              <span className={`text-right pr-2 font-mono ${isActive ? 'text-black' : (line.runningBalance >= 0 ? 'amount-debit' : 'amount-credit')}`}>
                {FMT.format(Math.abs(line.runningBalance))}
                <span className={`text-2xs ml-1 ${isActive ? 'text-black/60' : 'text-tally-muted'}`}>
                  {line.runningBalance >= 0 ? 'Dr' : 'Cr'}
                </span>
              </span>
            </div>
          )
        })}

        {!loading && lines.length === 0 && (
          <div className="text-tally-muted text-xs p-4 text-center">
            No transactions for this ledger in the selected period
          </div>
        )}
        {loading && (
          <div className="text-tally-muted text-xs p-4 text-center">Loading…</div>
        )}
      </div>

      {/* Closing balance footer */}
      {result && (
        <div className="grid grid-cols-[90px_70px_90px_2fr_1fr_1fr_1fr] tally-header text-xs font-bold shrink-0 border-t-2 border-tally-yellow">
          <span className="col-span-4 text-tally-yellow">Closing Balance</span>
          <span></span>
          <span></span>
          <span className={`text-right pr-2 font-mono ${result.closingBalance >= 0 ? 'text-tally-green' : 'text-tally-red'}`}>
            {FMT.format(Math.abs(result.closingBalance))}
            <span className="text-tally-muted text-2xs ml-1">
              {result.closingBalance >= 0 ? 'Dr' : 'Cr'}
            </span>
          </span>
        </div>
      )}

      {/* Status bar */}
      <div className="flex items-center px-3 py-1 border-t border-tally-border shrink-0 bg-tally-panel text-2xs text-tally-muted">
        <span>{lines.length} transaction{lines.length !== 1 ? 's' : ''}</span>
        <span className="ml-auto">↑↓ navigate · Enter alter · Alt+X cancel · Alt+D delete · Alt+Q audit log · F9 refresh · Esc back</span>
      </div>

      {editLogVoucher && (
        <EditLogModal
          voucherId={editLogVoucher.id}
          voucherNumber={editLogVoucher.number}
          onClose={() => setEditLogVoucher(null)}
        />
      )}
    </div>
  )
}
