import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from 'react'
import { api, type Voucher, type JournalLine, type VoucherType, type BillAllocation, type StockItem, type InvoiceItem } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'
import { LedgerAutoSuggest } from '../components/LedgerAutoSuggest'
import { BillAllocationModal } from '../components/BillAllocationModal'
import { ItemAutoSuggest } from '../components/ItemAutoSuggest'
import type { Ledger } from '../bridge/interop'

const VOUCHER_TYPES: VoucherType[] = ['Payment','Receipt','Contra','Journal','Sales','Purchase','CreditNote','DebitNote']
const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const CASH_BANK_PARENT_NAMES = new Set(['Bank Accounts', 'Cash-in-Hand', 'Cash in Hand', 'Cash-In-Hand'])

/**
 * Build a Set of leaf-ledger IDs that sit under a Cash/Bank group node.
 * Runs once per ledger list change (O(n), cheap).
 */
function buildCashBankIds(allLedgers: Ledger[]): Set<number> {
  const groupIds = new Set(
    allLedgers
      .filter(l => l.isGroup && CASH_BANK_PARENT_NAMES.has(l.name))
      .map(l => l.id)
  )
  return new Set(
    allLedgers
      .filter(l => !l.isGroup && l.parentId != null && groupIds.has(l.parentId))
      .map(l => l.id)
  )
}

/**
 * Derive which ledger IDs are allowed for this voucher type + column side.
 * Returns undefined = no restriction.
 */
function getAllowedIds(
  voucherType: VoucherType,
  col: 'dr' | 'cr',
  cashBankIds: Set<number>,
): Set<number> | undefined {
  switch (voucherType) {
    case 'Payment': return col === 'cr' ? cashBankIds : undefined
    case 'Receipt': return col === 'dr' ? cashBankIds : undefined
    case 'Contra':  return cashBankIds
    default:        return undefined
  }
}

// Stable colour + shortcut label per voucher type for the header badge
const VTYPE_META: Record<VoucherType, { color: string; hint: string }> = {
  Payment:    { color: 'text-orange-400',   hint: 'F5' },
  Receipt:    { color: 'text-tally-green',  hint: 'F6' },
  Contra:     { color: 'text-tally-blue',   hint: 'F4' },
  Journal:    { color: 'text-tally-yellow', hint: 'F7' },
  Sales:      { color: 'text-tally-green',  hint: '' },
  Purchase:   { color: 'text-orange-400',   hint: '' },
  CreditNote: { color: 'text-tally-muted',  hint: '' },
  DebitNote:  { color: 'text-tally-muted',  hint: '' },
}

function emptyLine(): JournalLine {
  return { ledgerId: 0, debitAmount: 0, creditAmount: 0, narration: '' }
}

function emptyInvoiceItem(): InvoiceItem {
  return { stockItemId: 0, itemName: '', quantity: 0, rate: 0, amount: 0 }
}

const INVOICE_TYPES = new Set<VoucherType>(['Sales', 'Purchase', 'CreditNote', 'DebitNote'])

export function VoucherEntry() {
  const {
    goBack, setStatus,
    editVoucher, setEditVoucher,
    editVoucherId, setEditVoucherId,
    ledgers: storeLedgers, setLedgers,
    companyName,
  } = useAppStore()
  const [type, setType]           = useState<VoucherType>('Journal')
  const [date, setDate]           = useState(new Date().toISOString().slice(0, 10))
  const [voucherNo, setVoucherNo] = useState('')
  const [narration, setNarration] = useState('')
  const [lines, setLines]         = useState<JournalLine[]>([emptyLine(), emptyLine()])
  const [saving, setSaving]       = useState(false)
  const [editId, setEditId]       = useState<number | null>(null)  // non-null = update mode
  const [billModal, setBillModal] = useState<{ rowIdx: number; ledgerName: string; amount: number } | null>(null)
  const [itemMode, setItemMode]   = useState(false)  // Alt+I: Item Invoice Mode
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([emptyInvoiceItem()])
  const [partyLedgerId, setPartyLedgerId]     = useState(0)
  const [tradingLedgerId, setTradingLedgerId] = useState(0)
  const [stockItems, setStockItems]   = useState<StockItem[]>([])
  const firstRef = useRef<HTMLSelectElement>(null)

  // Per-row Dr input refs so we can focus them after ledger selection
  const drRefs = useRef<(HTMLInputElement | null)[]>([])
  const crRefs = useRef<(HTMLInputElement | null)[]>([])

  // Leaf ledgers from store (already cached; no extra fetch needed)
  const leafLedgers = storeLedgers.filter((l: Ledger) => !l.isGroup)

  // Set of bill-wise ledger IDs
  const billWiseIds = useMemo(
    () => new Set(storeLedgers.filter(l => l.maintainBillWise).map(l => l.id)),
    [storeLedgers]
  )

  // Cash/Bank eligible IDs — recomputed only when store changes
  const cashBankIds = useMemo(() => buildCashBankIds(storeLedgers), [storeLedgers])

  // Invoice totals
  const invoiceTotal = invoiceItems.reduce((s, i) => s + (Number(i.amount) || 0), 0)

  const loadVoucher = useCallback((v: Voucher) => {
    setType(v.type); setDate(v.date)
    setVoucherNo(v.voucherNumber); setNarration(v.narration ?? '')
    setLines(v.lines.map(l => ({ ...l })))
    setEditId(v.id ?? null)
  }, [])

  useEffect(() => {
    // Populate store if empty (first visit)
    if (storeLedgers.length === 0) {
      api.ledger.list().then(r => { if (r.ok && r.data) setLedgers(r.data) })
    }
    // Load stock items for item invoice mode
    api.stock.listItems().then(r => { if (r.ok && r.data) setStockItems(r.data) })
    if (editVoucherId != null) {
      // Drill-down path: load by ID from backend
      api.voucher.get(editVoucherId).then(r => {
        if (r.ok && r.data) loadVoucher(r.data)
        else setStatus(r.error ?? 'Failed to load voucher', 'error')
      })
    } else if (editVoucher) {
      // Legacy path: voucher object passed directly in store
      loadVoucher(editVoucher)
    }
    setTimeout(() => firstRef.current?.focus(), 50)
    // Cleanup drill-down context on unmount
    return () => { setEditVoucherId(null); setEditVoucher(null) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const totalDebit  = lines.reduce((s, l) => s + (Number(l.debitAmount)  || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0)
  const balanced    = Math.abs(totalDebit - totalCredit) < 0.000001

  const updateLine = useCallback((i: number, field: keyof JournalLine, value: string | number) => {
    setLines(prev => prev.map((l, idx) => idx === i ? { ...l, [field]: value } : l))
  }, [])

  const addLine = () => {
    setLines(prev => [...prev, emptyLine()])
  }

  const removeLine = (i: number) => {
    if (lines.length <= 2) return
    setLines(prev => prev.filter((_, idx) => idx !== i))
  }

  const handleDelete = useCallback(async () => {
    if (editId == null) return
    if (!window.confirm(`Delete voucher ${voucherNo}? This cannot be undone.`)) return
    setSaving(true)
    const res = await api.voucher.delete(editId)
    if (res.ok) { setStatus('Voucher deleted', 'success'); goBack() }
    else        { setStatus(res.error ?? 'Delete failed', 'error') }
    setSaving(false)
  }, [editId, voucherNo, setStatus, goBack])

  const handleCancel = useCallback(async () => {
    if (editId == null) return
    if (!window.confirm(`Cancel voucher ${voucherNo}? The voucher number will be preserved but amounts will be zeroed.`)) return
    setSaving(true)
    const res = await api.voucher.cancel(editId)
    if (res.ok) { setStatus('Voucher cancelled', 'success'); goBack() }
    else        { setStatus(res.error ?? 'Cancel failed', 'error') }
    setSaving(false)
  }, [editId, voucherNo, setStatus, goBack])

  const handleSaveInvoice = useCallback(async () => {
    if (partyLedgerId === 0)   { setStatus('Select a Party A/c', 'error'); return }
    if (tradingLedgerId === 0) { setStatus('Select a Sales/Purchase Ledger', 'error'); return }
    const validItems = invoiceItems.filter(i => i.stockItemId > 0 && i.quantity > 0 && i.amount > 0)
    if (validItems.length === 0) { setStatus('Add at least one item', 'error'); return }
    setSaving(true)
    const voucherNumber = voucherNo || `${type.slice(0, 2).toUpperCase()}-${Date.now()}`
    const res = await api.stock.saveInvoice({
      voucherType: type, date, voucherNumber, narration,
      partyLedgerId, tradingLedgerId, items: validItems
    })
    if (res.ok) { setStatus('Invoice saved', 'success'); goBack() }
    else        { setStatus(res.error ?? 'Save failed', 'error') }
    setSaving(false)
  }, [partyLedgerId, tradingLedgerId, invoiceItems, type, date, voucherNo, narration, setStatus, goBack])

  const handleSave = useCallback(async () => {
    if (itemMode) { handleSaveInvoice(); return }
    if (!balanced) { setStatus('Voucher does not balance — debits must equal credits', 'error'); return }
    const validLines = lines.filter(l => l.ledgerId > 0 && (l.debitAmount > 0 || l.creditAmount > 0))
    if (validLines.length < 2) { setStatus('At least 2 valid journal lines required', 'error'); return }
    setSaving(true)
    const voucherNumber = voucherNo || `${type.slice(0, 2).toUpperCase()}-${Date.now()}`
    if (editId != null) {
      // Update existing voucher
      const updated: Voucher = { id: editId, type, date, voucherNumber, narration, lines: validLines }
      const res = await api.voucher.update(updated)
      if (res.ok) { setStatus('Voucher updated', 'success'); goBack() }
      else        { setStatus(res.error ?? 'Update failed', 'error') }
    } else {
      // New voucher
      const voucher: Omit<Voucher, 'id'> = { type, date, voucherNumber, narration, lines: validLines }
      const res = await api.voucher.save(voucher)
      if (res.ok) { setStatus('Voucher saved', 'success'); goBack() }
      else        { setStatus(res.error ?? 'Save failed', 'error') }
    }
    setSaving(false)
  }, [balanced, lines, type, date, voucherNo, narration, editId, itemMode, handleSaveInvoice, setStatus, goBack])

  // F4–F7 type switching + Ctrl+S save + Alt+D delete + Alt+X cancel + Alt+P print + Alt+I invoice
  useKeyboard((action) => {
    if (action === 'save')            handleSave()
    if (action === 'vtype-contra')    { setType('Contra');   setItemMode(false) }
    if (action === 'vtype-payment')   { setType('Payment');  setItemMode(false) }
    if (action === 'vtype-receipt')   { setType('Receipt');  setItemMode(false) }
    if (action === 'vtype-journal')   { setType('Journal');  setItemMode(false) }
    if (action === 'delete-voucher')  handleDelete()
    if (action === 'cancel-voucher')  handleCancel()
    if (action === 'print-document')  window.print()
    if (action === 'item-invoice') {
      if (!INVOICE_TYPES.has(type)) setType('Sales')
      setItemMode(v => !v)
    }
  })

  // After ledger selected on row i → focus Dr input of that row
  const handleLedgerCommit = useCallback((rowIdx: number) => {
    drRefs.current[rowIdx]?.focus()
    drRefs.current[rowIdx]?.select()
  }, [])

  // Enter in Dr cell → focus Cr; Enter in Cr → check bill-wise, otherwise next row
  const handleAmountEnter = useCallback((e: React.KeyboardEvent, rowIdx: number, col: 'dr' | 'cr') => {
    if (e.key !== 'Enter') return
    e.preventDefault(); e.stopPropagation()
    if (col === 'dr') {
      crRefs.current[rowIdx]?.focus()
      crRefs.current[rowIdx]?.select()
    } else {
      const line = lines[rowIdx]
      const amount = (line.debitAmount || 0) + (line.creditAmount || 0)
      if (amount > 0 && line.ledgerId > 0 && billWiseIds.has(line.ledgerId)) {
        const ledger = storeLedgers.find(l => l.id === line.ledgerId)
        setBillModal({ rowIdx, ledgerName: ledger?.name ?? 'Ledger', amount })
        return
      }
      // Move to ledger input of next row (or add a row)
      const nextInputs = document.querySelectorAll<HTMLInputElement>('[data-ledger-row]')
      const next = nextInputs[rowIdx + 1]
      if (next) next.focus()
      else addLine()
    }
  }, [lines, billWiseIds, storeLedgers])

  const handleBillModalConfirm = useCallback((allocations: BillAllocation[]) => {
    if (!billModal) return
    setLines(prev => prev.map((l, idx) =>
      idx === billModal.rowIdx ? { ...l, billAllocations: allocations } : l
    ))
    setBillModal(null)
    // Move to next row
    const nextInputs = document.querySelectorAll<HTMLInputElement>('[data-ledger-row]')
    const next = nextInputs[billModal.rowIdx + 1]
    setTimeout(() => { if (next) next.focus(); else addLine() }, 10)
  }, [billModal])

  const validLines = lines.filter(l => l.ledgerId > 0 && (l.debitAmount > 0 || l.creditAmount > 0))

  return (
    <div className="flex flex-col h-full">
      <div className="tally-header shrink-0 justify-between">
        <div className="flex items-center gap-3">
          <span>{editId != null ? 'Voucher Alter' : 'Voucher Entry'}</span>
          <span className={`text-sm font-bold tracking-wide ${
            VTYPE_META[type]?.color ?? 'text-tally-text'
          }`}>
            {type}
          </span>
          {VTYPE_META[type]?.hint && (
            <span className="text-2xs text-tally-muted font-mono">[{VTYPE_META[type].hint}]</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {itemMode && (
            <span className="text-2xs bg-tally-blue/20 border border-tally-blue text-tally-blue px-2 py-0.5 rounded">
              Item Invoice  [Alt+I]
            </span>
          )}
          <span className={`text-xs font-mono ${
            itemMode
              ? 'text-tally-text'
              : balanced ? 'text-tally-green' : 'text-tally-red'
          }`}>
            {itemMode
              ? `Total: ${FMT.format(invoiceTotal)}`
              : balanced ? '✓ Balanced' : `Diff: ${FMT.format(Math.abs(totalDebit - totalCredit))}`
            }
          </span>
        </div>
      </div>

      {/* ── Print-only voucher document ──────────────────────────────────── */}
      <div className="print-only hidden">
        <div style={{ fontFamily: 'Arial, sans-serif', color: '#000', padding: '0 0 8pt 0' }}>

          {/* Company name */}
          <div style={{ textAlign: 'center', fontSize: '15pt', fontWeight: 'bold', borderBottom: '2pt solid #000', paddingBottom: '4pt', marginBottom: '6pt' }}>
            {companyName ?? 'Company'}
          </div>

          {/* Voucher meta row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '10pt', marginBottom: '8pt' }}>
            <div><strong>Voucher Type:</strong> {type}</div>
            <div><strong>Voucher No.:</strong> {voucherNo || '—'}</div>
            <div><strong>Date:</strong> {date}</div>
          </div>

          {narration && (
            <div style={{ fontSize: '9pt', marginBottom: '8pt' }}>
              <strong>Narration:</strong> {narration}
            </div>
          )}

          {/* Journal lines table */}
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10pt', marginBottom: '12pt' }}>
            <thead>
              <tr style={{ borderBottom: '1pt solid #000' }}>
                <th style={{ textAlign: 'left',  padding: '3pt 4pt', width: '50%' }}>Ledger Account</th>
                <th style={{ textAlign: 'right', padding: '3pt 4pt', width: '20%' }}>Debit (Dr)</th>
                <th style={{ textAlign: 'right', padding: '3pt 4pt', width: '20%' }}>Credit (Cr)</th>
                <th style={{ textAlign: 'left',  padding: '3pt 4pt', width: '10%' }}>Narration</th>
              </tr>
            </thead>
            <tbody>
              {validLines.map((l, i) => {
                const ledger = storeLedgers.find(x => x.id === l.ledgerId)
                return (
                  <tr key={i} style={{ borderBottom: '0.5pt solid #ccc' }}>
                    <td style={{ padding: '3pt 4pt' }}>{ledger?.name ?? `Ledger #${l.ledgerId}`}</td>
                    <td style={{ textAlign: 'right', padding: '3pt 4pt', fontFamily: 'monospace' }}>
                      {l.debitAmount  > 0 ? FMT.format(l.debitAmount)  : '—'}
                    </td>
                    <td style={{ textAlign: 'right', padding: '3pt 4pt', fontFamily: 'monospace' }}>
                      {l.creditAmount > 0 ? FMT.format(l.creditAmount) : '—'}
                    </td>
                    <td style={{ padding: '3pt 4pt', fontSize: '8pt', color: '#555' }}>{l.narration ?? ''}</td>
                  </tr>
                )
              })}
              {/* Totals */}
              <tr style={{ borderTop: '1pt solid #000', fontWeight: 'bold' }}>
                <td style={{ padding: '4pt 4pt' }}>Total</td>
                <td style={{ textAlign: 'right', padding: '4pt 4pt', fontFamily: 'monospace' }}>
                  {FMT.format(lines.reduce((s, l) => s + l.debitAmount, 0))}
                </td>
                <td style={{ textAlign: 'right', padding: '4pt 4pt', fontFamily: 'monospace' }}>
                  {FMT.format(lines.reduce((s, l) => s + l.creditAmount, 0))}
                </td>
                <td></td>
              </tr>
            </tbody>
          </table>

          {/* Signatory lines */}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24pt', fontSize: '9pt' }}>
            <div style={{ borderTop: '1pt solid #000', paddingTop: '4pt', minWidth: '100pt', textAlign: 'center' }}>
              Prepared By
            </div>
            <div style={{ borderTop: '1pt solid #000', paddingTop: '4pt', minWidth: '100pt', textAlign: 'center' }}>
              Checked By
            </div>
            <div style={{ borderTop: '1pt solid #000', paddingTop: '4pt', minWidth: '100pt', textAlign: 'center' }}>
              Authorized Signatory
            </div>
          </div>
        </div>
      </div>

      {/* Top fields */}
      <div className="grid grid-cols-4 gap-x-4 gap-y-1 px-3 py-2 border-b border-tally-border shrink-0 bg-tally-panel">
        <Field label="Type">
          <select ref={firstRef}
            className="tally-input border border-tally-border px-1 py-0.5 w-full bg-tally-panel"
            value={type} onChange={e => setType(e.target.value as VoucherType)}>
            {VOUCHER_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
        <Field label="Date">
          <input type="date" className="tally-input border border-tally-border px-1 py-0.5 w-full"
            value={date} onChange={e => setDate(e.target.value)} />
        </Field>
        <Field label="Voucher No.">
          <input className="tally-input border border-tally-border px-1 py-0.5 w-full"
            placeholder="Auto" value={voucherNo} onChange={e => setVoucherNo(e.target.value)} />
        </Field>
        <Field label="Narration">
          <input className="tally-input border border-tally-border px-1 py-0.5 w-full"
            value={narration} onChange={e => setNarration(e.target.value)} />
        </Field>
      </div>

      {/* ── Item Invoice mode: Party / Trading Ledger header ── */}
      {itemMode && (
        <div className="grid grid-cols-2 gap-x-4 px-3 py-2 border-b border-tally-border shrink-0 bg-tally-panel">
          <Field label={type === 'Purchase' || type === 'DebitNote' ? 'Supplier A/c (Party)' : 'Customer A/c (Party)'}>
            <LedgerAutoSuggest
              ledgers={leafLedgers}
              value={partyLedgerId}
              onSelect={l => setPartyLedgerId(l.id)}
              onCommit={() => {}}
              placeholder="Party ledger…"
              tabIndex={1001}
            />
          </Field>
          <Field label={type === 'Purchase' || type === 'DebitNote' ? 'Purchase Ledger' : 'Sales Ledger'}>
            <LedgerAutoSuggest
              ledgers={leafLedgers}
              value={tradingLedgerId}
              onSelect={l => setTradingLedgerId(l.id)}
              onCommit={() => {}}
              placeholder="Sales / Purchase ledger…"
              tabIndex={1002}
            />
          </Field>
        </div>
      )}

      {/* ── Item Invoice grid ────────────────────────────────── */}
      {itemMode ? (
        <>
          <div className="grid grid-cols-[2fr_90px_100px_110px_28px] tally-header text-2xs shrink-0">
            <span>Name of Item</span>
            <span className="text-right pr-2">Quantity</span>
            <span className="text-right pr-2">Rate</span>
            <span className="text-right pr-2">Amount</span>
            <span></span>
          </div>

          <div className="flex-1 overflow-y-auto">
            {invoiceItems.map((item, i) => (
              <div key={i} className="grid grid-cols-[2fr_90px_100px_110px_28px] border-b border-tally-border items-stretch text-2xs">
                <ItemAutoSuggest
                  items={stockItems}
                  value={item.stockItemId}
                  onSelect={si => setInvoiceItems(prev => prev.map((x, idx) =>
                    idx === i ? { ...x, stockItemId: si.id, itemName: si.name } : x
                  ))}
                  onCommit={() => {
                    const qEl = document.querySelectorAll<HTMLInputElement>('[data-inv-qty]')[i]
                    qEl?.focus(); qEl?.select()
                  }}
                  tabIndex={i * 3 + 1}
                />
                <input
                  data-inv-qty
                  type="number" min="0" step="0.001"
                  tabIndex={i * 3 + 2}
                  className="tally-input text-right px-2 border-r border-tally-border font-mono focus:bg-tally-accent focus:outline-none"
                  placeholder="Qty"
                  value={item.quantity || ''}
                  onChange={e => {
                    const qty = parseFloat(e.target.value) || 0
                    setInvoiceItems(prev => prev.map((x, idx) =>
                      idx === i ? { ...x, quantity: qty, amount: qty * x.rate } : x
                    ))
                  }}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    const rEl = document.querySelectorAll<HTMLInputElement>('[data-inv-rate]')[i]
                    rEl?.focus(); rEl?.select()
                  }}
                />
                <input
                  data-inv-rate
                  type="number" min="0" step="0.01"
                  tabIndex={i * 3 + 3}
                  className="tally-input text-right px-2 border-r border-tally-border font-mono focus:bg-tally-accent focus:outline-none"
                  placeholder="Rate"
                  value={item.rate || ''}
                  onChange={e => {
                    const rate = parseFloat(e.target.value) || 0
                    setInvoiceItems(prev => prev.map((x, idx) =>
                      idx === i ? { ...x, rate, amount: x.quantity * rate } : x
                    ))
                  }}
                  onFocus={e => e.target.select()}
                  onKeyDown={e => {
                    if (e.key !== 'Enter') return
                    e.preventDefault()
                    // Move to next row
                    const nextRowItem = document.querySelectorAll<HTMLInputElement>('[data-item-row]')[i + 1]?.querySelector('input')
                    if (nextRowItem) nextRowItem.focus()
                    else setInvoiceItems(prev => [...prev, emptyInvoiceItem()])
                  }}
                />
                <span className="tally-input text-right px-2 border-r border-tally-border font-mono text-tally-text bg-tally-accent/30 flex items-center justify-end">
                  {item.amount > 0 ? FMT.format(item.amount) : ''}
                </span>
                <button
                  className="flex items-center justify-center text-tally-red hover:text-white text-xs w-7"
                  onClick={() => setInvoiceItems(prev => prev.filter((_, idx) => idx !== i || prev.length === 1))}
                  tabIndex={-1}
                >✕</button>
              </div>
            ))}

            {/* Invoice totals */}
            <div className="grid grid-cols-[2fr_90px_100px_110px_28px] bg-tally-accent font-bold text-2xs px-0 py-1">
              <span className="text-tally-yellow pl-2">Total</span>
              <span></span><span></span>
              <span className="text-right font-mono pr-2 amount-debit">{FMT.format(invoiceTotal)}</span>
              <span></span>
            </div>
          </div>
        </>
      ) : (
        <>
      {/* Journal lines header */}
      <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] tally-header text-2xs shrink-0">
        <span>
          Ledger Account
          {(type === 'Payment' || type === 'Receipt' || type === 'Contra') && (
            <span className="ml-2 text-tally-blue font-normal">
              {type === 'Contra'  ? '(· Cash/Bank only)' :
               type === 'Payment' ? '(· Cr: Cash/Bank)' :
               '(· Dr: Cash/Bank)'}
            </span>
          )}
        </span>
        <span className="text-right pr-2">Debit (Dr)</span>
        <span className="text-right pr-2">Credit (Cr)</span>
        <span>Narration</span>
        <span className="w-8"></span>
      </div>

      {/* Journal lines */}
      <div className="flex-1 overflow-y-auto">
        {lines.map((line, i) => (
          <div key={i} className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] border-b border-tally-border items-stretch text-2xs">

            {/* Ledger auto-suggest — keyboard-isolated, context-aware */}
            <LedgerAutoSuggest
              ledgers={leafLedgers}
              value={line.ledgerId}
              onSelect={ledger => updateLine(i, 'ledgerId', ledger.id)}
              onCommit={() => handleLedgerCommit(i)}
              allowedIds={
                line.creditAmount > 0 ? getAllowedIds(type, 'cr', cashBankIds) :
                line.debitAmount  > 0 ? getAllowedIds(type, 'dr', cashBankIds) :
                undefined
              }
              placeholder="Type ledger name…"
              tabIndex={i * 4 + 1}
            />

            {/* Debit */}
            <input
              ref={el => { drRefs.current[i] = el }}
              data-ledger-row
              type="number" min="0" step="0.01"
              tabIndex={i * 4 + 2}
              className="tally-input text-right px-2 border-r border-tally-border amount-debit
                         focus:bg-tally-accent focus:outline-none"
              value={line.debitAmount || ''}
              onChange={e => updateLine(i, 'debitAmount', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()}
              onKeyDown={e => handleAmountEnter(e, i, 'dr')}
            />

            {/* Credit */}
            <input
              ref={el => { crRefs.current[i] = el }}
              type="number" min="0" step="0.01"
              tabIndex={i * 4 + 3}
              className="tally-input text-right px-2 border-r border-tally-border amount-credit
                         focus:bg-tally-accent focus:outline-none"
              value={line.creditAmount || ''}
              onChange={e => updateLine(i, 'creditAmount', parseFloat(e.target.value) || 0)}
              onFocus={e => e.target.select()}
              onKeyDown={e => handleAmountEnter(e, i, 'cr')}
            />

            {/* Line narration */}
            <input
              tabIndex={i * 4 + 4}
              className="tally-input px-1 border-r border-tally-border
                         focus:bg-tally-accent focus:outline-none"
              value={line.narration || ''}
              onChange={e => updateLine(i, 'narration', e.target.value)}
            />

            <div className="flex items-center">
              {line.billAllocations && line.billAllocations.length > 0 && (
                <button
                  className="text-tally-blue text-2xs px-1 hover:text-white"
                  title={line.billAllocations.map(a => `${a.refType}: ${a.refName} (${a.amount})`).join(', ')}
                  onClick={() => {
                    const ledger = storeLedgers.find(l => l.id === line.ledgerId)
                    setBillModal({ rowIdx: i, ledgerName: ledger?.name ?? 'Ledger', amount: (line.debitAmount || 0) + (line.creditAmount || 0) })
                  }}
                  tabIndex={-1}
                >B</button>
              )}
              <button
                className="w-8 flex items-center justify-center text-tally-red hover:text-white text-xs"
                onClick={() => removeLine(i)} tabIndex={-1}
              >✕</button>
            </div>
          </div>
        ))}

        {/* Totals row */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] bg-tally-accent font-bold text-2xs px-2 py-1">
          <span className="text-tally-yellow">Total</span>
          <span className={`text-right font-mono pr-2 ${totalDebit > 0 ? 'amount-debit' : 'amount-zero'}`}>
            {FMT.format(totalDebit)}
          </span>
          <span className={`text-right font-mono pr-2 ${totalCredit > 0 ? 'amount-credit' : 'amount-zero'}`}>
            {FMT.format(totalCredit)}
          </span>
          <span></span><span></span>
        </div>
      </div>

        </>
      )}

      {/* Bill Allocation Modal */}
      {billModal && (
        <BillAllocationModal
          ledgerName={billModal.ledgerName}
          totalAmount={billModal.amount}
          initial={lines[billModal.rowIdx]?.billAllocations}
          onConfirm={handleBillModalConfirm}
          onCancel={() => setBillModal(null)}
        />
      )}

      {/* Action bar */}
      <div className="no-print flex items-center gap-2 px-3 py-1.5 border-t border-tally-border shrink-0 bg-tally-panel">
        {itemMode
          ? <button className="tally-btn" onClick={() => setInvoiceItems(prev => [...prev, emptyInvoiceItem()])} tabIndex={-1}>+ Add Item</button>
          : <button className="tally-btn" onClick={addLine} tabIndex={-1}>+ Add Line</button>
        }
        <button
          className="tally-btn-primary px-6"
          onClick={handleSave} disabled={saving} tabIndex={-1}
        >
          {saving ? 'Saving…' : editId != null ? 'Update  [Ctrl+S]' : 'Accept  [Ctrl+S]'}
        </button>
        <button className="tally-btn px-4" onClick={goBack} tabIndex={-1}>Cancel  [Esc]</button>
        {editId != null && (
          <>
            <div className="w-px h-4 bg-tally-border mx-1" />
            <button
              className="tally-btn px-3 text-tally-yellow hover:text-yellow-300"
              onClick={handleCancel} disabled={saving} tabIndex={-1}
            >
              Cancel Vch  [Alt+X]
            </button>
            <button
              className="tally-btn px-3 text-tally-red hover:text-red-400"
              onClick={handleDelete} disabled={saving} tabIndex={-1}
            >
              Delete  [Alt+D]
            </button>
          </>
        )}
        <span className="ml-auto text-2xs text-tally-muted">
          Alt+I Item Invoice · F4 Contra · F5 Payment · F6 Receipt · F7 Journal · Ctrl+S save · Alt+P print
        </span>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-tally-muted text-2xs mb-0.5">{label}</div>
      {children}
    </div>
  )
}
