import { useEffect, useState, useRef, useCallback } from 'react'
import { api, type TrialBalanceGroup, type TbGroupRow, type TbLedgerRow } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const EMPTY = '-'

/** Flatten the hierarchical structure into a single scroll-navigable list */
interface FlatRow {
  key: string
  kind: 'section' | 'group' | 'ledger' | 'subtotal'
  label: string
  debit: number
  credit: number
  depth: number     // 0 = section header, 1 = group, 2 = ledger under group
  ledgerId?: number // only set for kind === 'ledger'
}

function flatten(groups: TrialBalanceGroup[]): FlatRow[] {
  const rows: FlatRow[] = []
  for (const g of groups) {
    rows.push({ key: `sec-${g.group}`, kind: 'section', label: g.group,
                debit: g.totalDebit, credit: g.totalCredit, depth: 0 })
    for (const row of g.rows) {
      if (row.isGroup) {
        const r = row as TbGroupRow
        rows.push({ key: `grp-${r.id}`, kind: 'group', label: r.name,
                    debit: r.subtotalDebit, credit: r.subtotalCredit, depth: 1 })
        for (const child of r.children) {
          rows.push({ key: `led-${child.id}`, kind: 'ledger', label: child.name,
                      debit: child.debit, credit: child.credit, depth: 2, ledgerId: child.id })
        }
      } else {
        const r = row as TbLedgerRow
        rows.push({ key: `led-${r.id}`, kind: 'ledger', label: r.name,
                    debit: r.debit, credit: r.credit, depth: 1, ledgerId: r.id })
      }
    }
  }
  return rows
}

export function TrialBalance() {
  const { setStatus, setScreen, setDrillLedgerId } = useAppStore()
  const [groups, setGroups]   = useState<TrialBalanceGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [activeIdx, setActiveIdx] = useState(0)
  const listRef   = useRef<HTMLDivElement>(null)
  const activeRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const r = await api.report.trialBalance()
    if (r.ok && r.data) setGroups(r.data)
    else setStatus(r.error ?? 'Failed to load trial balance', 'error')
    setLoading(false)
  }, [setStatus])

  useEffect(() => { load() }, [load])

  // Scroll active row into view
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx])

  const flat = flatten(groups)
  // Only navigable rows are group + ledger (skip section headers)
  const navigable = flat.filter(r => r.kind !== 'section')

  const totalDebit  = groups.reduce((s, g) => s + g.totalDebit,  0)
  const totalCredit = groups.reduce((s, g) => s + g.totalCredit, 0)
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.01

  const drillInto = useCallback((row: FlatRow) => {
    if (row.kind !== 'ledger' || !row.ledgerId) return
    setDrillLedgerId(row.ledgerId)
    setScreen('ledger-vouchers')
  }, [setDrillLedgerId, setScreen])

  useKeyboard((action) => {
    if (action === 'up')              setActiveIdx(i => Math.max(0, i - 1))
    if (action === 'down')            setActiveIdx(i => Math.min(navigable.length - 1, i + 1))
    if (action === 'report')          load()
    if (action === 'submit')          drillInto(navigable[activeIdx])
    if (action === 'print-document')  window.print()
  })

  let navIdx = -1   // tracks position in navigable array for highlighting

  const { companyName } = useAppStore()

  return (
    <div className="flex flex-col h-full">

      {/* Print-only report header */}
      <div className="print-only hidden" style={{ fontFamily: 'Arial, sans-serif', color: '#000', marginBottom: '8pt' }}>
        <div style={{ textAlign: 'center', fontSize: '15pt', fontWeight: 'bold', borderBottom: '2pt solid #000', paddingBottom: '4pt', marginBottom: '4pt' }}>
          {companyName ?? 'Company'}
        </div>
        <div style={{ textAlign: 'center', fontSize: '11pt', marginBottom: '2pt' }}>Trial Balance</div>
        <div style={{ textAlign: 'center', fontSize: '9pt', color: '#555' }}>
          Printed: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          &nbsp;&nbsp;|&nbsp;&nbsp;
          {balanced ? 'Balanced ✓' : 'NOT BALANCED ✗'}
        </div>
      </div>

      {/* Header */}
      <div className="no-print tally-header shrink-0 justify-between">
        <span>Trial Balance</span>
        <div className="flex items-center gap-4">
          {loading && <span className="text-2xs text-tally-muted animate-pulse">Loading…</span>}
          <span className={`text-xs font-mono ${
            loading ? 'text-tally-muted' : balanced ? 'text-tally-green' : 'text-tally-red'
          }`}>
            {loading ? '' : balanced ? '✓ Balanced' : '✗ Not Balanced'}
          </span>
          <button className="tally-btn text-2xs px-2 py-0.5" onClick={load} tabIndex={-1}>
            F9 Refresh
          </button>
        </div>
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[2fr_1fr_1fr] tally-header text-2xs shrink-0">
        <span>Particulars</span>
        <span className="text-right pr-2">Debit (Dr)</span>
        <span className="text-right pr-2">Credit (Cr)</span>
      </div>

      {/* Scrollable rows */}
      <div ref={listRef} className="flex-1 overflow-y-auto">
        {flat.map(row => {
          // Increment nav index only for navigable rows
          if (row.kind !== 'section') navIdx++
          const isActive = row.kind !== 'section' && navIdx === activeIdx

          if (row.kind === 'section') {
            return (
              <div key={row.key}
                className="grid grid-cols-[2fr_1fr_1fr] px-2 py-1
                           bg-tally-border/30 border-b border-tally-border font-bold text-2xs">
                <span className="text-tally-yellow uppercase tracking-widest text-3xs">
                  {row.label}
                </span>
                <span className="text-right font-mono pr-2 text-tally-muted text-3xs">
                  {row.debit > 0 ? FMT.format(row.debit) : ''}
                </span>
                <span className="text-right font-mono pr-2 text-tally-muted text-3xs">
                  {row.credit > 0 ? FMT.format(row.credit) : ''}
                </span>
              </div>
            )
          }

          if (row.kind === 'group') {
            return (
              <div key={row.key}
                ref={isActive ? activeRef : undefined}
                className={`grid grid-cols-[2fr_1fr_1fr] px-2 py-1 border-b border-tally-border
                            font-semibold text-2xs cursor-default
                            ${isActive ? 'bg-tally-highlight text-black' : 'bg-tally-accent text-tally-text'}`}>
                <span style={{ paddingLeft: `${row.depth * 12}px` }}>{row.label}</span>
                <span className={`text-right font-mono pr-2 ${
                  isActive ? 'text-black' : row.debit > 0 ? 'amount-debit' : 'amount-zero'}`}>
                  {row.debit > 0 ? FMT.format(row.debit) : EMPTY}
                </span>
                <span className={`text-right font-mono pr-2 ${
                  isActive ? 'text-black' : row.credit > 0 ? 'amount-credit' : 'amount-zero'}`}>
                  {row.credit > 0 ? FMT.format(row.credit) : EMPTY}
                </span>
              </div>
            )
          }

          // kind === 'ledger'
          return (
            <div key={row.key}
              ref={isActive ? activeRef : undefined}
              className={`grid grid-cols-[2fr_1fr_1fr] px-2 py-0.5 border-b border-tally-border/50
                          text-2xs cursor-default
                          ${isActive ? 'bg-tally-highlight text-black' : 'hover:bg-tally-accent/50 text-tally-text'}`}>
              <span style={{ paddingLeft: `${row.depth * 12}px` }}>{row.label}</span>
              <span className={`text-right font-mono pr-2 ${
                isActive ? 'text-black' : row.debit > 0 ? 'amount-debit' : 'amount-zero'}`}>
                {row.debit > 0 ? FMT.format(row.debit) : EMPTY}
              </span>
              <span className={`text-right font-mono pr-2 ${
                isActive ? 'text-black' : row.credit > 0 ? 'amount-credit' : 'amount-zero'}`}>
                {row.credit > 0 ? FMT.format(row.credit) : EMPTY}
              </span>
            </div>
          )
        })}
      </div>

      {/* Grand total */}
      <div className="grid grid-cols-[2fr_1fr_1fr] tally-header text-xs font-bold shrink-0
                      border-t-2 border-tally-yellow">
        <span className="text-tally-yellow">Grand Total</span>
        <span className={`text-right font-mono pr-2 ${balanced ? 'text-tally-green' : 'text-tally-red'}`}>
          {FMT.format(totalDebit)}
        </span>
        <span className={`text-right font-mono pr-2 ${balanced ? 'text-tally-green' : 'text-tally-red'}`}>
          {FMT.format(totalCredit)}
        </span>
      </div>

      <div className="no-print px-3 py-1 border-t border-tally-border text-2xs text-tally-muted shrink-0">
        ↑↓ navigate · F9 refresh · Alt+P print · Esc back
      </div>
    </div>
  )
}
