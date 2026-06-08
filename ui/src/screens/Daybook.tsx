import { useEffect, useState, useRef, useCallback } from 'react'
import { api, type DaybookRow } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'
import { EditLogModal } from '../components/EditLogModal'

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Daybook() {
  const { setStatus, setScreen, setEditVoucherId, companyName } = useAppStore()
  const [rows, setRows]         = useState<DaybookRow[]>([])
  const [loading, setLoading]   = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const [date, setDate]         = useState(new Date().toISOString().slice(0, 10))
  const [editLogVoucher, setEditLogVoucher] = useState<{ id: number; number: string } | null>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async (d: string) => {
    setLoading(true)
    const r = await api.report.daybook(d, d)
    if (r.ok && r.data) setRows(r.data.rows)
    else setStatus(r.error ?? 'Failed to load daybook', 'error')
    setLoading(false)
    setActiveIdx(0)
  }, [setStatus])

  useEffect(() => { load(date) }, [date, load])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const totalDebit  = rows.reduce((s, r) => s + r.debit,  0)
  const totalCredit = rows.reduce((s, r) => s + r.credit, 0)

  const openVoucher = useCallback((voucherId: number) => {
    setEditVoucherId(voucherId)
    setScreen('voucher-entry')
  }, [setEditVoucherId, setScreen])

  const handleDelete = useCallback(async () => {
    const row = rows[activeIdx]
    if (!row) return
    if (!window.confirm(`Delete voucher ${row.voucherNumber}? This cannot be undone.`)) return
    const res = await api.voucher.delete(row.voucherId)
    if (res.ok) { setStatus('Voucher deleted', 'success'); load(date) }
    else setStatus(res.error ?? 'Delete failed', 'error')
  }, [rows, activeIdx, date, load, setStatus])

  const handleCancel = useCallback(async () => {
    const row = rows[activeIdx]
    if (!row) return
    if (row.isCancelled) { setStatus('Voucher is already cancelled', 'error'); return }
    if (!window.confirm(`Cancel voucher ${row.voucherNumber}? Amounts will be zeroed but the number is preserved.`)) return
    const res = await api.voucher.cancel(row.voucherId)
    if (res.ok) { setStatus('Voucher cancelled', 'success'); load(date) }
    else setStatus(res.error ?? 'Cancel failed', 'error')
  }, [rows, activeIdx, date, load, setStatus])

  useKeyboard((action) => {
    if (action === 'up')              setActiveIdx(i => Math.max(0, i - 1))
    if (action === 'down')            setActiveIdx(i => Math.min(rows.length - 1, i + 1))
    if (action === 'report')          load(date)
    if (action === 'submit' && rows[activeIdx]) openVoucher(rows[activeIdx].voucherId)
    if (action === 'delete-voucher')  handleDelete()
    if (action === 'cancel-voucher')  handleCancel()
    if (action === 'print-document')  window.print()
    if (action === 'view-edit-log' && rows[activeIdx]) {
      const row = rows[activeIdx]
      setEditLogVoucher({ id: row.voucherId, number: row.voucherNumber })
    }
  })

  // Build voucher-group separators: first line of each new voucherNumber shows header info
  let lastVchNo = ''

  const uniqueVouchers = new Set(rows.map(r => r.voucherNumber)).size

  return (
    <div className="flex flex-col h-full">

      {/* Print-only report header */}
      <div className="print-only hidden" style={{ fontFamily: 'Arial, sans-serif', color: '#000', marginBottom: '8pt' }}>
        <div style={{ textAlign: 'center', fontSize: '15pt', fontWeight: 'bold', borderBottom: '2pt solid #000', paddingBottom: '4pt', marginBottom: '4pt' }}>
          {companyName ?? 'Company'}
        </div>
        <div style={{ textAlign: 'center', fontSize: '11pt', marginBottom: '2pt' }}>Daybook</div>
        <div style={{ textAlign: 'center', fontSize: '9pt', color: '#555' }}>
          Date: {date}&nbsp;&nbsp;|&nbsp;&nbsp;{uniqueVouchers} voucher{uniqueVouchers !== 1 ? 's' : ''}
          &nbsp;&nbsp;|&nbsp;&nbsp;Printed: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
        </div>
      </div>

      {/* Header */}
      <div className="no-print tally-header shrink-0 justify-between">
        <span>Daybook</span>
        <div className="flex items-center gap-3">
          {loading && <span className="text-2xs text-tally-muted animate-pulse">Loading…</span>}
          <span className="text-tally-muted text-2xs">Date</span>
          <input
            type="date"
            className="tally-input border border-tally-border px-1 text-2xs"
            value={date}
            onChange={e => setDate(e.target.value)}
            tabIndex={-1}
          />
          <button className="tally-btn text-2xs px-2 py-0.5" onClick={() => load(date)} tabIndex={-1}>
            F9 Refresh
          </button>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[90px_70px_2fr_1fr_90px_90px] tally-header text-2xs shrink-0">
        <span>Vch No.</span>
        <span>Type</span>
        <span>Particulars / Ledger</span>
        <span>Narration</span>
        <span className="text-right pr-2">Debit (Dr)</span>
        <span className="text-right pr-2">Credit (Cr)</span>
      </div>

      {/* Scrollable rows */}
      <div className="flex-1 overflow-y-auto">
        {rows.length === 0 && !loading && (
          <div className="text-tally-muted text-xs p-6 text-center">
            No transactions on {date}
          </div>
        )}

        {rows.map((row, i) => {
          const isNewVoucher = row.voucherNumber !== lastVchNo
          lastVchNo = row.voucherNumber
          const isActive = i === activeIdx

          return (
            <div key={`${row.voucherNumber}-${i}`}>
              {/* Voucher header separator */}
              {isNewVoucher && (
                <div className="grid grid-cols-[90px_70px_2fr_1fr_90px_90px]
                                px-2 py-0.5 bg-tally-accent/60 border-b border-tally-border
                                text-2xs font-semibold">
                  <span className="font-mono text-tally-blue">{row.voucherNumber}</span>
                  <span className="text-tally-yellow">{row.voucherType}</span>
                  <span className="text-tally-muted col-span-4 truncate">{row.narration || '—'}</span>
                </div>
              )}

              {/* Journal line row */}
              <div
                ref={isActive ? activeRef : undefined}
                onClick={() => { setActiveIdx(i); openVoucher(row.voucherId) }}
                className={`grid grid-cols-[90px_70px_2fr_1fr_90px_90px]
                            px-2 py-0.5 border-b border-tally-border/40 text-2xs cursor-pointer
                            ${isActive
                              ? 'bg-tally-highlight text-black'
                              : row.isCancelled
                                ? 'opacity-50 text-tally-muted'
                                : 'hover:bg-tally-accent/40 text-tally-text'}`}
              >
                <span></span>
                <span></span>
                <span className={`truncate ${isActive ? 'text-black' : row.isCancelled ? 'line-through text-tally-muted' : 'text-tally-text'}`}>
                  {row.isCancelled ? '** CANCELLED **' : row.ledgerName}
                </span>
                <span className={`text-2xs truncate ${isActive ? 'text-black' : 'text-tally-muted'}`}>
                  {row.isCancelled ? '' : (row.lineNarration || '')}
                </span>
                <span className={`text-right font-mono pr-2 ${isActive ? 'text-black' : row.isCancelled ? 'line-through' : row.debit > 0 ? 'amount-debit' : 'amount-zero'}`}>
                  {row.debit > 0 ? FMT.format(row.debit) : '-'}
                </span>
                <span className={`text-right font-mono pr-2 ${isActive ? 'text-black' : row.isCancelled ? 'line-through' : row.credit > 0 ? 'amount-credit' : 'amount-zero'}`}>
                  {row.credit > 0 ? FMT.format(row.credit) : '-'}
                </span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Day total */}
      <div className="grid grid-cols-[90px_70px_2fr_1fr_90px_90px] tally-header text-xs font-bold
                      shrink-0 border-t-2 border-tally-yellow">
        <span className="col-span-4 text-tally-yellow">Day Total</span>
        <span className="text-right font-mono pr-2 amount-debit">{FMT.format(totalDebit)}</span>
        <span className="text-right font-mono pr-2 amount-credit">{FMT.format(totalCredit)}</span>
      </div>

      <div className="no-print px-3 py-1 border-t border-tally-border text-2xs text-tally-muted shrink-0">
        ↑↓ navigate · Enter alter · Alt+X cancel · Alt+D delete · Alt+Q audit log · Alt+P print · F9 refresh · Esc back · {rows.length} lines
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
