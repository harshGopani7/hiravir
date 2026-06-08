import { useEffect, useState } from 'react'
import { api, type Voucher } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

const FMT = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function VoucherList() {
  const { setScreen, setEditVoucher, setStatus } = useAppStore()
  const [vouchers, setVouchers] = useState<Voucher[]>([])
  const [selected, setSelected] = useState(0)
  const [from, setFrom] = useState(new Date().getFullYear() + '-04-01')
  const [to,   setTo]   = useState(new Date().toISOString().slice(0, 10))

  const load = async () => {
    const r = await api.voucher.list({ from, to })
    if (r.ok && r.data) setVouchers(r.data)
    else setStatus(r.error ?? 'Failed', 'error')
  }

  useEffect(() => { load() }, [])

  useKeyboard((action) => {
    if (action === 'up')   setSelected(i => Math.max(0, i - 1))
    if (action === 'down') setSelected(i => Math.min(vouchers.length - 1, i + 1))
    if (action === 'new')  { setEditVoucher(null); setScreen('voucher-entry') }
    if (action === 'submit' && vouchers[selected]) {
      setEditVoucher(vouchers[selected]); setScreen('voucher-entry')
    }
    if (action === 'delete' && vouchers[selected]) handleDelete(vouchers[selected].id!)
  })

  const handleDelete = async (id: number) => {
    const r = await api.voucher.delete(id)
    if (r.ok) { setStatus('Deleted', 'success'); load() }
    else setStatus(r.error ?? 'Delete failed', 'error')
  }

  const totalDebit = (v: Voucher) => v.lines.reduce((s, l) => s + l.debitAmount, 0)

  return (
    <div className="flex flex-col h-full">
      <div className="tally-header shrink-0 justify-between">
        <span>Vouchers</span>
        <div className="flex items-center gap-2 text-2xs">
          <span className="text-tally-muted">From</span>
          <input type="date" className="tally-input border border-tally-border px-1"
            value={from} onChange={e => setFrom(e.target.value)} />
          <span className="text-tally-muted">To</span>
          <input type="date" className="tally-input border border-tally-border px-1"
            value={to} onChange={e => setTo(e.target.value)} />
          <button className="tally-btn" onClick={load}>Go</button>
          <button className="tally-btn" onClick={() => { setEditVoucher(null); setScreen('voucher-entry') }}>
            F2 New
          </button>
        </div>
      </div>

      <div className="grid grid-cols-[80px_100px_1fr_100px_80px_60px] tally-header text-2xs shrink-0">
        <span>Date</span>
        <span>Type</span>
        <span>Narration</span>
        <span>Voucher No.</span>
        <span className="text-right">Amount</span>
        <span className="text-center">Action</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {vouchers.map((v, i) => (
          <div
            key={v.id}
            className={`grid grid-cols-[80px_100px_1fr_100px_80px_60px] tally-row text-2xs
              ${i === selected ? 'selected' : ''}`}
            onClick={() => setSelected(i)}
            onDoubleClick={() => { setEditVoucher(v); setScreen('voucher-entry') }}
          >
            <span className="font-mono">{v.date}</span>
            <span className="text-tally-yellow">{v.type}</span>
            <span className="truncate text-tally-muted">{v.narration ?? '—'}</span>
            <span className="font-mono text-tally-blue">{v.voucherNumber}</span>
            <span className="text-right font-mono amount-debit">{FMT.format(totalDebit(v))}</span>
            <span className="text-center">
              <button
                className="text-tally-red hover:text-white text-2xs px-1"
                onClick={e => { e.stopPropagation(); handleDelete(v.id!) }}
                tabIndex={-1}
              >Del</button>
            </span>
          </div>
        ))}
        {vouchers.length === 0 && (
          <div className="text-tally-muted text-xs p-4 text-center">No vouchers in range</div>
        )}
      </div>

      <div className="tally-header text-2xs shrink-0">
        ↑↓ Navigate  ·  Enter Edit  ·  F8 Delete  ·  F2 New  ·  Esc Back
      </div>
    </div>
  )
}
