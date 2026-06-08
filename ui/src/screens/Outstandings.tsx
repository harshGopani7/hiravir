import { useState, useEffect } from 'react'
import { api, type OutstandingRow } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function Outstandings() {
  const { setStatus } = useAppStore()
  const [rows, setRows] = useState<OutstandingRow[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<'all' | 'receivable' | 'payable'>('all')

  useEffect(() => {
    api.report.outstanding().then(r => {
      if (r.ok && r.data) setRows(r.data)
      else setStatus(r.error ?? 'Failed to load outstandings', 'error')
      setLoading(false)
    })
  }, [])

  useKeyboard(() => {})

  const filtered = rows.filter(r => {
    if (filter === 'receivable') return r.pendingAmount > 0
    if (filter === 'payable')    return r.pendingAmount < 0
    return true
  })

  const totalReceivable = rows.filter(r => r.pendingAmount > 0).reduce((s, r) => s + r.pendingAmount, 0)
  const totalPayable    = rows.filter(r => r.pendingAmount < 0).reduce((s, r) => s + Math.abs(r.pendingAmount), 0)

  return (
    <div className="flex flex-col h-full">
      <div className="tally-header shrink-0 justify-between">
        <span>Outstanding Bills</span>
        <div className="flex gap-2 text-2xs">
          {(['all', 'receivable', 'payable'] as const).map(f => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-2 py-0.5 border rounded text-2xs capitalize transition-colors
                ${filter === f
                  ? 'border-tally-blue bg-tally-blue/20 text-tally-blue'
                  : 'border-tally-border text-tally-muted hover:text-tally-text'}`}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 border-b border-tally-border bg-tally-panel shrink-0 text-2xs">
        <div className="px-4 py-1.5 border-r border-tally-border">
          <span className="text-tally-muted">Total Bills</span>
          <span className="ml-2 font-mono text-tally-text">{rows.length}</span>
        </div>
        <div className="px-4 py-1.5 border-r border-tally-border">
          <span className="text-tally-muted">Receivable</span>
          <span className="ml-2 font-mono amount-debit">{FMT.format(totalReceivable)}</span>
        </div>
        <div className="px-4 py-1.5">
          <span className="text-tally-muted">Payable</span>
          <span className="ml-2 font-mono amount-credit">{FMT.format(totalPayable)}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2fr_2fr_1fr_120px] tally-header shrink-0 text-2xs">
        <span>Ledger Name</span>
        <span>Bill / Ref No.</span>
        <span>Type</span>
        <span className="text-right pr-4">Pending Amount</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="text-tally-muted text-xs p-4 text-center">Loading…</div>
        )}
        {!loading && filtered.length === 0 && (
          <div className="text-tally-muted text-xs p-4 text-center">
            {rows.length === 0
              ? 'No outstanding bills. Save a voucher with bill allocations to see data here.'
              : 'No bills match the current filter.'}
          </div>
        )}
        {filtered.map((row, i) => {
          const isReceivable = row.pendingAmount > 0
          return (
            <div
              key={i}
              className="grid grid-cols-[2fr_2fr_1fr_120px] tally-row text-2xs"
            >
              <span className="truncate pl-1">{row.ledgerName}</span>
              <span className="font-mono text-tally-text truncate">{row.refName}</span>
              <span className={isReceivable ? 'text-tally-blue' : 'text-tally-yellow'}>
                {isReceivable ? 'Receivable' : 'Payable'}
              </span>
              <span className={`text-right font-mono pr-4 ${isReceivable ? 'amount-debit' : 'amount-credit'}`}>
                {FMT.format(Math.abs(row.pendingAmount))}
              </span>
            </div>
          )
        })}
      </div>

      <div className="tally-header text-2xs shrink-0">
        O Outstandings  ·  Esc Back  ·  Filter: All / Receivable / Payable
      </div>
    </div>
  )
}
