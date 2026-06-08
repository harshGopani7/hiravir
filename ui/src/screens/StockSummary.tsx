import { useState, useEffect } from 'react'
import { api, type StockSummaryRow } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

const FMT     = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const QTY_FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 3, maximumFractionDigits: 3 })

function SummaryRow({ row, depth }: { row: StockSummaryRow; depth: number }) {
  const [open, setOpen] = useState(true)
  const indent = depth * 16

  return (
    <>
      <div
        className={`grid grid-cols-[1fr_120px_110px_110px] tally-row text-2xs cursor-pointer select-none
          ${row.isGroup ? 'font-semibold bg-tally-accent/40' : ''}`}
        onClick={() => row.children.length > 0 && setOpen(v => !v)}
        style={{ paddingLeft: indent + 8 }}
      >
        <span className="flex items-center gap-1 truncate">
          {row.children.length > 0 && (
            <span className="text-tally-blue font-mono text-2xs w-3 shrink-0">
              {open ? '▾' : '▸'}
            </span>
          )}
          <span className={row.isGroup ? 'text-tally-yellow' : 'text-tally-text'}>{row.name}</span>
          {!row.isGroup && row.unit && (
            <span className="text-tally-muted ml-1">({row.unit})</span>
          )}
        </span>
        <span className={`text-right font-mono pr-2 ${row.quantity !== 0 ? 'text-tally-text' : 'amount-zero'}`}>
          {row.quantity !== 0 ? QTY_FMT.format(row.quantity) : '—'}
        </span>
        <span className={`text-right font-mono pr-2 ${!row.isGroup && row.rate ? 'text-tally-muted' : ''}`}>
          {!row.isGroup && row.rate ? FMT.format(row.rate) : ''}
        </span>
        <span className={`text-right font-mono pr-4 ${row.value > 0 ? 'amount-debit' : row.value < 0 ? 'amount-credit' : 'amount-zero'}`}>
          {row.value !== 0 ? FMT.format(Math.abs(row.value)) : '—'}
        </span>
      </div>
      {open && row.children.map((child, i) => (
        <SummaryRow key={i} row={child} depth={depth + 1} />
      ))}
    </>
  )
}

export function StockSummary() {
  const { setStatus } = useAppStore()
  const [rows, setRows]     = useState<StockSummaryRow[]>([])
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    api.report.stockSummary().then(r => {
      if (r.ok && r.data) setRows(r.data)
      else setStatus(r.error ?? 'Failed to load stock summary', 'error')
      setLoading(false)
    })
  }

  useEffect(load, [])

  useKeyboard((action) => {
    if (action === 'report') load()   // F9 = refresh
  })

  const totalValue = rows.reduce((s, g) => s + g.value, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="tally-header shrink-0 justify-between">
        <span>Stock Summary</span>
        <span className="text-2xs text-tally-muted">F9 Refresh</span>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-3 border-b border-tally-border bg-tally-panel shrink-0 text-2xs">
        <div className="px-4 py-1.5 border-r border-tally-border">
          <span className="text-tally-muted">Stock Groups</span>
          <span className="ml-2 font-mono text-tally-text">{rows.length}</span>
        </div>
        <div className="px-4 py-1.5 border-r border-tally-border">
          <span className="text-tally-muted">Total Items</span>
          <span className="ml-2 font-mono text-tally-text">
            {rows.reduce((s, g) => s + g.children.filter(c => !c.isGroup).length, 0)}
          </span>
        </div>
        <div className="px-4 py-1.5">
          <span className="text-tally-muted">Total Value</span>
          <span className="ml-2 font-mono amount-debit">{FMT.format(Math.abs(totalValue))}</span>
        </div>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[1fr_120px_110px_110px] tally-header text-2xs shrink-0">
        <span className="pl-2">Stock Item / Group</span>
        <span className="text-right pr-2">Closing Qty</span>
        <span className="text-right pr-2">Avg Rate</span>
        <span className="text-right pr-4">Value</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {loading && (
          <div className="text-tally-muted text-xs p-4 text-center">Loading…</div>
        )}
        {!loading && rows.length === 0 && (
          <div className="text-tally-muted text-xs p-4 text-center">
            No stock groups found. Create stock items and save an Item Invoice (Alt+I in Voucher Entry).
          </div>
        )}
        {rows.map((row, i) => (
          <SummaryRow key={i} row={row} depth={0} />
        ))}
      </div>

      <div className="tally-header text-2xs shrink-0 justify-between">
        <span>S Stock Summary  ·  Esc Back  ·  F9 Refresh</span>
        <span className="font-mono text-tally-yellow">
          {totalValue !== 0 ? `Total: ${FMT.format(Math.abs(totalValue))}` : ''}
        </span>
      </div>
    </div>
  )
}
