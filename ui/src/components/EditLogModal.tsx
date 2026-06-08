import { useState, useEffect, useCallback } from 'react'
import { api, type EditLogEntry } from '../bridge/interop'

interface Props {
  voucherId: number
  voucherNumber: string
  onClose: () => void
}

const ACTION_META: Record<string, { label: string; color: string; icon: string }> = {
  Created:   { label: 'Created',   color: 'text-tally-green',  icon: '✦' },
  Altered:   { label: 'Altered',   color: 'text-tally-yellow', icon: '✎' },
  Cancelled: { label: 'Cancelled', color: 'text-orange-400',   icon: '⊘' },
  Deleted:   { label: 'Deleted',   color: 'text-tally-red',    icon: '✕' },
}

function formatTs(ms: number): string {
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(new Date(ms))
}

function PreviousStateViewer({ json }: { json: string }) {
  let parsed: unknown = null
  try { parsed = JSON.parse(json) } catch { /* raw fallback */ }

  if (!parsed || typeof parsed !== 'object') return (
    <pre className="text-2xs font-mono text-tally-text overflow-auto max-h-64 whitespace-pre-wrap">{json}</pre>
  )

  const v = parsed as Record<string, unknown>
  const lines = (v.lines as unknown[] ?? []) as Record<string, unknown>[]

  return (
    <div className="text-2xs space-y-1">
      <div className="flex gap-4 text-tally-muted mb-1">
        <span><span className="text-tally-text font-semibold">Type</span> {String(v.type ?? '')}</span>
        <span><span className="text-tally-text font-semibold">Date</span> {String(v.date ?? '')}</span>
        <span><span className="text-tally-text font-semibold">No.</span> {String(v.voucherNumber ?? '')}</span>
      </div>
      {!!v.narration && (
        <div className="text-tally-muted italic">{String(v.narration)}</div>
      )}
      <table className="w-full border-collapse mt-1">
        <thead>
          <tr className="text-tally-muted border-b border-tally-border">
            <th className="text-left py-0.5 font-normal">Ledger ID</th>
            <th className="text-right py-0.5 font-normal pr-2">Dr</th>
            <th className="text-right py-0.5 font-normal">Cr</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="border-b border-tally-border/30">
              <td className="py-0.5 text-tally-text font-mono">{String(l.ledgerId ?? l.ledger_id ?? '')}</td>
              <td className="text-right py-0.5 font-mono pr-2 amount-debit">
                {Number(l.debitAmount ?? l.debit_amt ?? 0) > 0
                  ? Number(l.debitAmount ?? l.debit_amt).toFixed(2) : '—'}
              </td>
              <td className="text-right py-0.5 font-mono amount-credit">
                {Number(l.creditAmount ?? l.credit_amt ?? 0) > 0
                  ? Number(l.creditAmount ?? l.credit_amt).toFixed(2) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function EditLogModal({ voucherId, voucherNumber, onClose }: Props) {
  const [entries, setEntries] = useState<EditLogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    api.voucher.editLog(voucherId).then(r => {
      if (r.ok && r.data) setEntries(r.data)
      setLoading(false)
    })
  }, [voucherId])

  const handleBackdrop = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  const handleKey = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
  }, [onClose])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
      onMouseDown={handleBackdrop}
      onKeyDown={handleKey}
      tabIndex={-1}
    >
      <div
        className="bg-tally-panel border border-tally-border shadow-2xl flex flex-col"
        style={{ width: 560, maxHeight: '80vh' }}
      >
        {/* Header */}
        <div className="tally-header shrink-0 justify-between">
          <div className="flex items-center gap-2">
            <span>Edit Log</span>
            <span className="text-tally-blue font-mono text-xs">{voucherNumber}</span>
          </div>
          <button
            className="text-tally-muted hover:text-white text-sm px-2"
            onClick={onClose} tabIndex={-1}
          >✕</button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-0">
          {loading && (
            <div className="text-tally-muted text-xs p-4 text-center">Loading…</div>
          )}
          {!loading && entries.length === 0 && (
            <div className="text-tally-muted text-xs p-4 text-center">
              No audit history found for this voucher.
            </div>
          )}

          {/* Timeline */}
          <div className="relative">
            {/* Vertical line */}
            <div className="absolute left-[27px] top-0 bottom-0 w-px bg-tally-border" />

            {entries.map((entry, i) => {
              const meta = ACTION_META[entry.actionType] ?? ACTION_META['Altered']
              const isFirst = i === 0
              const isOpen  = expanded === entry.id
              const hasPrev = !!entry.previousState

              return (
                <div key={entry.id} className="relative flex gap-3 px-4 py-3 border-b border-tally-border/40">
                  {/* Timeline dot */}
                  <div className={`relative z-10 flex items-center justify-center w-7 h-7 shrink-0
                    rounded-full border text-xs font-bold
                    ${isFirst
                      ? 'bg-tally-blue border-tally-blue text-white'
                      : 'bg-tally-panel border-tally-border'} ${meta.color}`}>
                    {meta.icon}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className={`font-semibold text-xs ${meta.color}`}>{meta.label}</span>
                      <span className="text-2xs text-tally-muted font-mono">{formatTs(entry.timestamp)}</span>
                      {isFirst && (
                        <span className="text-2xs bg-tally-blue/20 text-tally-blue px-1 rounded">Latest</span>
                      )}
                    </div>

                    {/* Drill-down toggle for Altered/Cancelled/Deleted */}
                    {hasPrev && (
                      <button
                        className="mt-1 text-2xs text-tally-blue hover:text-white underline underline-offset-2"
                        onClick={() => setExpanded(isOpen ? null : entry.id)}
                      >
                        {isOpen ? '▲ Hide previous state' : '▼ View previous state'}
                      </button>
                    )}

                    {/* Previous state viewer */}
                    {isOpen && hasPrev && (
                      <div className="mt-2 p-2 bg-tally-accent/30 border border-tally-border rounded text-2xs">
                        <div className="text-tally-muted text-2xs mb-1 font-semibold uppercase tracking-wide">
                          State before this change
                        </div>
                        <PreviousStateViewer json={entry.previousState!} />
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 px-4 py-2 border-t border-tally-border text-2xs text-tally-muted flex justify-between">
          <span>{entries.length} event{entries.length !== 1 ? 's' : ''} · newest first</span>
          <span>Esc or click outside to close</span>
        </div>
      </div>
    </div>
  )
}
