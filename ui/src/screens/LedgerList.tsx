import { useEffect, useState, useRef } from 'react'
import { api, type Ledger } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmt = (n: number) => n === 0 ? '-' : FMT.format(Math.abs(n))

export function LedgerList() {
  const { setScreen, setStatus } = useAppStore()
  const [ledgers, setLedgers] = useState<Ledger[]>([])
  const [selected, setSelected] = useState(0)
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    api.ledger.list().then(r => {
      if (r.ok && r.data) setLedgers(r.data)
      else setStatus(r.error ?? 'Failed to load ledgers', 'error')
    })
    searchRef.current?.focus()
  }, [])

  const filtered = ledgers.filter(l =>
    l.name.toLowerCase().includes(search.toLowerCase())
  )

  useKeyboard((action) => {
    if (action === 'up') setSelected(i => Math.max(0, i - 1))
    else if (action === 'down') setSelected(i => Math.min(filtered.length - 1, i + 1))
    else if (action === 'new') setScreen('ledger-create')
  })

  const GROUP_COLOR: Record<string, string> = {
    Assets: 'text-tally-blue', Liabilities: 'text-tally-red',
    Capital: 'text-tally-yellow', Income: 'text-tally-green', Expenses: 'text-tally-muted',
  }

  return (
    <div className="flex flex-col h-full">
      <div className="tally-header justify-between shrink-0">
        <span>Ledger Accounts  ({filtered.length})</span>
        <button className="tally-btn" onClick={() => setScreen('ledger-create')}>F2 New</button>
      </div>

      <div className="px-2 py-1 border-b border-tally-border shrink-0 bg-tally-panel">
        <input
          ref={searchRef}
          className="tally-input border border-tally-border px-2 py-0.5 w-64"
          placeholder="Search ledger…"
          value={search}
          onChange={e => { setSearch(e.target.value); setSelected(0) }}
        />
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr] tally-header shrink-0 text-2xs">
        <span>Name</span>
        <span>Group</span>
        <span className="text-right">Debit</span>
        <span className="text-right">Credit</span>
      </div>

      {/* Rows */}
      <div className="flex-1 overflow-y-auto">
        {filtered.map((l, i) => {
          const bal = l.balance ?? 0
          const debit  = bal > 0 ? bal : 0
          const credit = bal < 0 ? -bal : 0
          return (
            <div
              key={l.id}
              className={`grid grid-cols-[2fr_1fr_1fr_1fr] tally-row text-2xs
                ${i === selected ? 'selected' : ''}
                ${l.isGroup ? 'font-bold text-tally-yellow' : ''}`}
              onClick={() => setSelected(i)}
            >
              <span className="truncate pl-1"
                style={{ paddingLeft: l.isGroup ? '4px' : '16px' }}>
                {l.name}
              </span>
              <span className={GROUP_COLOR[l.group] ?? ''}>{l.group}</span>
              <span className="text-right font-mono amount-debit">{fmt(debit)}</span>
              <span className="text-right font-mono amount-credit">{fmt(credit)}</span>
            </div>
          )
        })}
        {filtered.length === 0 && (
          <div className="text-tally-muted text-xs p-4 text-center">No ledgers found</div>
        )}
      </div>

      <div className="tally-header text-2xs shrink-0">
        ↑↓ Navigate  ·  F2 New  ·  Esc Back
      </div>
    </div>
  )
}
