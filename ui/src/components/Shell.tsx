import { useState, useEffect, type ReactNode } from 'react'
import { useAppStore } from '../store/appStore'
import { useKeyboard, moveFocus } from '../hooks/useKeyboard'
import { Sidebar } from './Sidebar'
import { StatusBar } from './StatusBar'
import { FunctionKeyBar } from './FunctionKeyBar'

interface ShellProps {
  children: ReactNode
}

const SCREEN_LABELS: Record<string, string> = {
  home: 'Dashboard',
  'ledger-list': 'Accounts',
  'ledger-create': 'New Ledger',
  'voucher-entry': 'Voucher Entry',
  'voucher-list': 'Vouchers',
  'trial-balance': 'Trial Balance',
  daybook: 'Daybook',
  'ledger-vouchers': 'Ledger Vouchers',
  outstandings: 'Outstandings',
  'stock-summary': 'Stock Summary',
  'poc-test': 'Bridge Test',
}

function LiveClock() {
  const [time, setTime] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  return (
    <span className="font-mono text-2xs text-ink-muted tabular-nums">
      {time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
    </span>
  )
}

export function Shell({ children }: ShellProps) {
  const { screen, setScreen, goBack, companyName } = useAppStore()

  useKeyboard((action, e) => {
    if (action === 'tab') { e.preventDefault(); moveFocus('next') }
    else if (action === 'shifttab') { e.preventDefault(); moveFocus('prev') }
    else if (action === 'new') {
      if (screen === 'ledger-list') setScreen('ledger-create')
      else if (screen === 'voucher-list') setScreen('voucher-entry')
    } else if (action === 'back') {
      if (screen !== 'home' && screen !== 'company-select') goBack()
    }
  })

  const isSetup = screen === 'company-select'

  if (isSetup) {
    return (
      <div className="h-full w-full flex items-center justify-center"
        style={{ background: 'radial-gradient(ellipse at 30% 40%, rgba(99,102,241,0.12) 0%, transparent 60%), radial-gradient(ellipse at 70% 70%, rgba(139,92,246,0.08) 0%, transparent 60%), #0d1117' }}>
        {children}
      </div>
    )
  }

  const screenLabel = SCREEN_LABELS[screen] ?? screen

  return (
    <div className="h-full w-full flex flex-col overflow-hidden"
      style={{ background: '#0d1117' }}>

      {/* ── Top navbar ────────────────────────────────────────────────────── */}
      <header className="no-print shrink-0 flex items-center justify-between px-4 h-10
                         border-b border-surface-600/50"
        style={{ background: 'rgba(13,17,23,0.95)', backdropFilter: 'blur(12px)' }}>

        {/* Left: logo + breadcrumb */}
        <div className="flex items-center gap-3">
          {/* Logo mark */}
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center text-white font-bold text-xs"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              H
            </div>
            <span className="font-semibold text-sm text-ink tracking-tight">Hiravir</span>
          </div>

          {/* Divider */}
          <span className="text-surface-600 text-base font-light select-none">/</span>

          {/* Breadcrumb */}
          <span className="text-xs text-ink-muted font-medium animate-fade-in" key={screen}>
            {screenLabel}
          </span>
        </div>

        {/* Right: company chip + date + clock */}
        <div className="flex items-center gap-3">
          {companyName && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full text-2xs
                            border border-brand/25 bg-brand/8 text-brand-light">
              <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />
              <span className="font-medium">{companyName}</span>
            </div>
          )}
          <span className="text-2xs text-ink-muted">
            {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
          </span>
          <LiveClock />
        </div>
      </header>

      {/* ── Body ──────────────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="no-print shrink-0" data-sidebar>
          <Sidebar />
        </div>
        <main className="flex-1 flex flex-col overflow-hidden print-root"
          style={{ background: 'radial-gradient(ellipse at 80% 10%, rgba(99,102,241,0.04) 0%, transparent 50%), #0d1117' }}>
          <div className="flex-1 overflow-auto animate-fade-in" key={screen}>
            {children}
          </div>
        </main>
      </div>

      <div className="no-print" data-function-bar><FunctionKeyBar /></div>
      <div className="no-print" data-status-bar><StatusBar /></div>
    </div>
  )
}
