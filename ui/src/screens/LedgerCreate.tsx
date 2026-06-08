import { useState, useRef, useEffect, type ReactNode } from 'react'
import { api, type LedgerGroup } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

const GROUPS: LedgerGroup[] = ['Assets', 'Liabilities', 'Capital', 'Income', 'Expenses']
const BILL_WISE_GROUPS = new Set(['Sundry Debtors', 'Sundry Creditors'])

export function LedgerCreate() {
  const { goBack, setStatus, addLedger, ledgers, setLedgers } = useAppStore()
  const [name, setName] = useState('')
  const [group, setGroup] = useState<LedgerGroup>('Assets')
  const [parentId, setParentId] = useState<number | null>(null)
  const [isGroup, setIsGroup] = useState(false)
  const [maintainBillWise, setMaintainBillWise] = useState(false)
  const [saving, setSaving] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  // Resolve selected parent group node name for bill-wise eligibility
  const parentLedger = ledgers.find(l => l.id === parentId)
  const showBillWise = !isGroup && (
    BILL_WISE_GROUPS.has(name) ||
    (parentLedger && BILL_WISE_GROUPS.has(parentLedger.name)) ||
    BILL_WISE_GROUPS.has(group)
  )

  // Group nodes whose name is a bill-wise group (Sundry Debtors / Creditors)
  const billWiseGroupNodes = ledgers.filter(l => l.isGroup && BILL_WISE_GROUPS.has(l.name))

  useEffect(() => {
    nameRef.current?.focus()
    if (ledgers.length === 0) {
      api.ledger.list().then(r => { if (r.ok && r.data) setLedgers(r.data) })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSave = async () => {
    if (!name.trim()) { setStatus('Name is required', 'error'); return }
    setSaving(true)
    const res = await api.ledger.create({ parentId, name: name.trim(), group, isGroup, maintainBillWise: showBillWise ? maintainBillWise : false })
    if (res.ok && res.data) {
      addLedger(res.data)
      setStatus(`Ledger "${name}" created`, 'success')
      goBack()
    } else {
      setStatus(res.error ?? 'Failed to create ledger', 'error')
    }
    setSaving(false)
  }

  useKeyboard((action) => {
    if (action === 'save' || action === 'submit') handleSave()
  })

  return (
    <div className="flex flex-col h-full">
      <div className="tally-header shrink-0">Create Ledger</div>

      <div className="flex-1 p-4 space-y-3 max-w-lg">
        <Row label="Name">
          <input
            ref={nameRef}
            className="tally-input border border-tally-border px-2 py-1 w-full"
            value={name}
            onChange={e => setName(e.target.value)}
          />
        </Row>

        <Row label="Under (Group)">
          <select
            className="tally-input border border-tally-border px-2 py-1 w-full bg-tally-panel"
            value={group}
            onChange={e => setGroup(e.target.value as LedgerGroup)}
          >
            {GROUPS.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </Row>

        {billWiseGroupNodes.length > 0 && !isGroup && (
          <Row label="Parent">
            <select
              className="tally-input border border-tally-border px-2 py-1 w-full bg-tally-panel"
              value={parentId ?? ''}
              onChange={e => setParentId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">(none)</option>
              {ledgers.filter(l => l.isGroup).map(l => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
          </Row>
        )}

        <Row label="Is Group?">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={isGroup}
              onChange={e => { setIsGroup(e.target.checked); if (e.target.checked) setMaintainBillWise(false) }}
              className="accent-tally-highlight"
            />
            <span className="text-xs text-tally-muted">Group (contains sub-ledgers)</span>
          </label>
        </Row>

        {showBillWise && (
          <Row label="Bill-by-Bill?">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={maintainBillWise}
                onChange={e => setMaintainBillWise(e.target.checked)}
                className="accent-tally-highlight"
              />
              <span className="text-xs text-tally-muted">
                Maintain balances bill-by-bill (Sundry Debtors / Creditors)
              </span>
            </label>
          </Row>
        )}

        <div className="flex gap-2 pt-2">
          <button className="tally-btn-primary px-6" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Accept  [Ctrl+S]'}
          </button>
          <button className="tally-btn px-6" onClick={goBack}>Cancel  [Esc]</button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-tally-muted text-xs w-32 shrink-0">{label}</span>
      <div className="flex-1">{children}</div>
    </div>
  )
}
