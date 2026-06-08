import { useState, useEffect, useRef } from 'react'
import type { BillAllocation } from '../bridge/interop'

const REF_TYPES: BillAllocation['refType'][] = ['New Ref', 'Agst Ref', 'Advance', 'On Account']

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

interface Props {
  ledgerName: string
  totalAmount: number
  initial?: BillAllocation[]
  onConfirm: (allocations: BillAllocation[]) => void
  onCancel: () => void
}

function emptyAlloc(): BillAllocation {
  return { refType: 'New Ref', refName: '', amount: 0 }
}

export function BillAllocationModal({ ledgerName, totalAmount, initial, onConfirm, onCancel }: Props) {
  const [rows, setRows] = useState<BillAllocation[]>(
    initial && initial.length > 0 ? initial.map(r => ({ ...r })) : [{ ...emptyAlloc(), amount: totalAmount }]
  )
  const firstRef = useRef<HTMLSelectElement>(null)

  useEffect(() => {
    firstRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const allocated = rows.reduce((s, r) => s + (Number(r.amount) || 0), 0)
  const diff = Math.abs(allocated - totalAmount)
  const balanced = diff < 0.000001

  const update = (i: number, field: keyof BillAllocation, value: string | number) => {
    setRows(prev => prev.map((r, idx) => idx === i ? { ...r, [field]: value } : r))
  }

  const addRow = () => setRows(prev => [...prev, emptyAlloc()])
  const removeRow = (i: number) => { if (rows.length > 1) setRows(prev => prev.filter((_, idx) => idx !== i)) }

  const handleConfirm = () => {
    if (!balanced) return
    const valid = rows.filter(r => r.refName.trim() && Number(r.amount) > 0)
    if (valid.length === 0) return
    onConfirm(valid.map(r => ({ ...r, amount: Number(r.amount) })))
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-tally-panel border border-tally-border w-[560px] max-h-[80vh] flex flex-col shadow-2xl">

        {/* Header */}
        <div className="tally-header shrink-0 justify-between">
          <span>Bill Allocation  —  <span className="text-tally-blue">{ledgerName}</span></span>
          <span className={`text-xs font-mono ${balanced ? 'text-tally-green' : 'text-tally-red'}`}>
            {balanced
              ? `✓ Balanced  ${FMT.format(totalAmount)}`
              : `Unallocated: ${FMT.format(totalAmount - allocated)}`}
          </span>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-[140px_1fr_110px_28px] text-2xs tally-header shrink-0">
          <span>Ref Type</span>
          <span>Bill / Invoice No.</span>
          <span className="text-right pr-2">Amount</span>
          <span></span>
        </div>

        {/* Rows */}
        <div className="overflow-y-auto flex-1">
          {rows.map((row, i) => (
            <div key={i} className="grid grid-cols-[140px_1fr_110px_28px] border-b border-tally-border items-stretch text-2xs">
              <select
                ref={i === 0 ? firstRef : undefined}
                className="tally-input bg-tally-panel px-1 border-r border-tally-border focus:bg-tally-accent focus:outline-none"
                value={row.refType}
                onChange={e => update(i, 'refType', e.target.value as BillAllocation['refType'])}
              >
                {REF_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <input
                className="tally-input px-2 border-r border-tally-border focus:bg-tally-accent focus:outline-none"
                placeholder="INV-001"
                value={row.refName}
                onChange={e => update(i, 'refName', e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addRow() } }}
              />
              <input
                type="number" min="0" step="0.01"
                className="tally-input text-right px-2 border-r border-tally-border font-mono focus:bg-tally-accent focus:outline-none"
                value={row.amount || ''}
                onChange={e => update(i, 'amount', parseFloat(e.target.value) || 0)}
                onFocus={e => e.target.select()}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); if (balanced) handleConfirm(); else addRow() } }}
              />
              <button
                className="flex items-center justify-center text-tally-red hover:text-white text-xs w-7"
                onClick={() => removeRow(i)} tabIndex={-1}
              >✕</button>
            </div>
          ))}
        </div>

        {/* Total row */}
        <div className="grid grid-cols-[140px_1fr_110px_28px] bg-tally-accent text-2xs font-bold border-t border-tally-border shrink-0">
          <span className="px-2 py-1 text-tally-yellow">Total</span>
          <span></span>
          <span className={`text-right px-2 py-1 font-mono ${balanced ? 'amount-debit' : 'text-tally-red'}`}>
            {FMT.format(allocated)}
          </span>
          <span></span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 px-3 py-2 border-t border-tally-border shrink-0">
          <button className="tally-btn" onClick={addRow} tabIndex={-1}>+ Add Row</button>
          <button
            className={`tally-btn-primary px-6 ${!balanced ? 'opacity-50 cursor-not-allowed' : ''}`}
            disabled={!balanced}
            onClick={handleConfirm}
          >
            Accept  [Enter]
          </button>
          <button className="tally-btn px-4" onClick={onCancel}>Cancel  [Esc]</button>
          <span className="ml-auto text-2xs text-tally-muted">
            Total must equal {FMT.format(totalAmount)}
          </span>
        </div>
      </div>
    </div>
  )
}
