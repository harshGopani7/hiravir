import { useState, useEffect, useRef, useCallback } from 'react'
import { api } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

interface DataMenuProps {
  onClose: () => void
}

const ITEMS = [
  {
    key: '1',
    label: 'Backup Company Data',
    sub: 'Creates a defragmented WAL-safe snapshot via VACUUM INTO (.hirdb)',
    action: 'backup' as const,
    danger: false,
  },
  {
    key: '2',
    label: 'Export to JSON',
    sub: 'Full structured export of all ledgers and vouchers (.json)',
    action: 'export' as const,
    danger: false,
  },
  {
    key: '3',
    label: 'Restore from Backup',
    sub: 'Replace active company data with a previously saved .hirdb backup',
    action: 'restore' as const,
    danger: true,
  },
]

export function DataMenu({ onClose }: DataMenuProps) {
  const { setStatus } = useAppStore()
  const [activeIdx, setActiveIdx] = useState(0)
  const [busy, setBusy] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Focus trap
  useEffect(() => { menuRef.current?.focus() }, [])

  const run = useCallback(async (action: 'backup' | 'export' | 'restore') => {
    if (busy) return
    if (action === 'restore') {
      if (!window.confirm(
        'Restore backup?\n\nThis will REPLACE all current company data with the selected backup file.\nThis action cannot be undone.'
      )) return
    }
    setBusy(true)
    try {
      const res = action === 'backup'
        ? await api.data.backup()
        : action === 'export'
          ? await api.data.export()
          : await api.data.restore()

      if (!res.ok) {
        setStatus(res.error ?? 'Operation failed', 'error')
      } else if (res.data?.cancelled) {
        setStatus('Operation cancelled', 'info')
      } else {
        const verb = action === 'backup' ? 'Backup saved' : action === 'export' ? 'Export saved' : 'Backup restored'
        setStatus(`${verb}: ${res.data?.path ?? ''}`, 'success')
      }
    } finally {
      setBusy(false)
      onClose()
    }
  }, [busy, onClose, setStatus])

  useKeyboard((action) => {
    if (action === 'back' || action === 'data-menu') { onClose(); return }
    if (action === 'up')   { setActiveIdx(i => Math.max(0, i - 1)); return }
    if (action === 'down') { setActiveIdx(i => Math.min(ITEMS.length - 1, i + 1)); return }
    if (action === 'submit') { run(ITEMS[activeIdx].action); return }
  })

  // Number key shortcuts via native keydown (not in KeyAction system)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const item = ITEMS.find(it => it.key === e.key)
      if (item) { e.preventDefault(); run(item.action) }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [run])

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 z-40"
        onClick={onClose}
      />

      {/* Modal panel */}
      <div
        ref={menuRef}
        tabIndex={-1}
        className="fixed inset-0 flex items-center justify-center z-50 outline-none"
      >
        <div className="bg-tally-panel border border-tally-yellow w-[480px] shadow-2xl">

          {/* Header */}
          <div className="tally-header px-4 py-2 justify-between">
            <span className="text-tally-yellow font-bold tracking-wide">
              Data Management  [Alt+Y]
            </span>
            <button
              onClick={onClose}
              className="text-tally-muted hover:text-tally-text text-xs"
              tabIndex={-1}
            >
              [Esc]
            </button>
          </div>

          {/* Menu items */}
          <div className="py-2">
            {ITEMS.map((item, i) => {
              const isActive = i === activeIdx
              return (
                <div
                  key={item.key}
                  onClick={() => run(item.action)}
                  onMouseEnter={() => setActiveIdx(i)}
                  className={`flex items-start gap-3 px-4 py-3 cursor-pointer transition-colors
                    ${isActive
                      ? item.danger ? 'bg-red-700 text-white' : 'bg-tally-highlight text-black'
                      : 'hover:bg-tally-accent/40 text-tally-text'}`}
                >
                  <span className={`text-sm font-bold w-5 shrink-0 ${
                    isActive ? 'text-white' : item.danger ? 'text-tally-red' : 'text-tally-yellow'
                  }`}>
                    {item.key}
                  </span>
                  <div className="min-w-0">
                    <div className={`text-sm font-semibold ${
                      isActive ? 'text-white' : item.danger ? 'text-tally-red' : 'text-tally-text'
                    }`}>
                      {item.label}
                    </div>
                    <div className={`text-2xs mt-0.5 ${isActive ? 'text-white/70' : 'text-tally-muted'}`}>
                      {item.sub}
                    </div>
                  </div>
                  {busy && isActive && (
                    <span className="ml-auto text-xs text-tally-blue animate-pulse shrink-0">
                      Working…
                    </span>
                  )}
                </div>
              )
            })}
          </div>

          {/* Footer */}
          <div className="border-t border-tally-border px-4 py-1.5 text-2xs text-tally-muted">
            ↑↓ navigate · Enter / 1–3 select · Esc close
          </div>
        </div>
      </div>
    </>
  )
}
