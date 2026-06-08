import { useAppStore, type Screen } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

interface MenuItem {
  label: string
  desc: string
  screen: Screen
  key: string
  icon: string
  gradient: string
  accent: string
}

const MENU_ITEMS: MenuItem[] = [
  { label: 'Voucher Entry',   desc: 'Record payments, receipts & journals',  screen: 'voucher-entry',  key: 'V', icon: '✎', gradient: 'from-violet-600/20 to-brand/10',    accent: '#818cf8' },
  { label: 'Daybook',         desc: 'Day-wise transaction listing',           screen: 'daybook',        key: 'D', icon: '◷', gradient: 'from-sky-600/20 to-info/10',        accent: '#38bdf8' },
  { label: 'Trial Balance',   desc: 'Account-wise balance summary',           screen: 'trial-balance',  key: 'T', icon: '⊜', gradient: 'from-emerald-600/20 to-success/10', accent: '#10b981' },
  { label: 'Outstandings',    desc: 'Receivables and payables aging',         screen: 'outstandings',   key: 'O', icon: '◈', gradient: 'from-amber-600/20 to-warning/10',   accent: '#f59e0b' },
  { label: 'Accounts Info',   desc: 'Ledger groups and chart of accounts',    screen: 'ledger-list',    key: 'A', icon: '◫', gradient: 'from-brand/15 to-violet-700/10',   accent: '#6366f1' },
  { label: 'Vouchers',        desc: 'Browse and search all vouchers',         screen: 'voucher-list',   key: 'B', icon: '≡', gradient: 'from-rose-600/20 to-danger/10',     accent: '#f43f5e' },
  { label: 'Stock Summary',   desc: 'Inventory quantities and valuation',     screen: 'stock-summary',  key: 'S', icon: '⬡', gradient: 'from-teal-600/20 to-success/10',    accent: '#14b8a6' },
  { label: 'Create Ledger',   desc: 'Add new account ledger or group',        screen: 'ledger-create',  key: 'L', icon: '+', gradient: 'from-surface-700/80 to-surface-800', accent: '#64748b' },
]

export function Home() {
  const { setScreen, companyName } = useAppStore()

  useKeyboard((_action, e) => {
    if (_action === 'report') { setScreen('trial-balance'); return }
    const key = e.key.toUpperCase()
    const item = MENU_ITEMS.find(m => m.key === key)
    if (item) setScreen(item.screen)
  })

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })

  return (
    <div className="h-full overflow-y-auto p-5" style={{ background: 'transparent' }}>

      {/* ── Welcome strip ──────────────────────────────────────────────── */}
      <div className="mb-6 animate-fade-in">
        <div className="flex items-end justify-between">
          <div>
            <h1 className="text-lg font-semibold text-ink mb-0.5">
              Welcome back
            </h1>
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-success animate-pulse" />
              <span className="text-xs text-ink-muted font-medium">{companyName}</span>
              <span className="text-ink-faint">·</span>
              <span className="text-xs text-ink-muted">{today}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setScreen('voucher-entry')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold text-white
                         transition-all duration-200 hover:brightness-110 hover:shadow-glow active:scale-95"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            >
              <span>+</span> New Voucher
            </button>
          </div>
        </div>
      </div>

      {/* ── Quick-stat strip ────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { label: 'FY',      value: '2024-25',   color: 'text-brand-light' },
          { label: 'Currency', value: '₹ INR',    color: 'text-success-light' },
          { label: 'DB',       value: 'Live',      color: 'text-success-light' },
          { label: 'Mode',     value: 'WAL',       color: 'text-info-light' },
        ].map((s, i) => (
          <div key={i}
            className="rounded-lg px-3 py-2.5 border border-surface-600/50 flex items-center justify-between"
            style={{ background: '#161d2e', animationDelay: `${i * 40}ms` }}>
            <span className="text-2xs text-ink-muted font-medium">{s.label}</span>
            <span className={`text-xs font-semibold font-mono ${s.color}`}>{s.value}</span>
          </div>
        ))}
      </div>

      {/* ── Module grid ─────────────────────────────────────────────────── */}
      <div className="text-2xs text-ink-muted font-semibold uppercase tracking-widest mb-3 select-none">
        Modules · press key or click
      </div>

      <div className="grid grid-cols-4 gap-3">
        {MENU_ITEMS.map((item, i) => (
          <button
            key={item.screen}
            onClick={() => setScreen(item.screen)}
            className={`group relative overflow-hidden rounded-xl p-4 text-left
                        border border-surface-600/40
                        bg-gradient-to-br ${item.gradient}
                        hover:border-opacity-60 hover:shadow-card-hover
                        active:scale-[0.98]
                        transition-all duration-200`}
            style={{
              background: undefined,
              animation: `fade-in 200ms ease-out ${i * 35}ms both`,
            }}
          >
            {/* Gradient blob */}
            <div className="absolute inset-0 bg-gradient-to-br opacity-100 transition-opacity duration-200
                            group-hover:opacity-[1.4]"
              style={{ background: `linear-gradient(135deg, ${item.accent}20 0%, transparent 70%)` }} />

            {/* Top row: icon + key badge */}
            <div className="relative flex items-center justify-between mb-2.5">
              <span className="text-lg leading-none" style={{ color: item.accent }}>{item.icon}</span>
              <span className="text-2xs font-mono font-bold px-1.5 py-0.5 rounded-sm"
                style={{ background: `${item.accent}20`, color: item.accent }}>
                {item.key}
              </span>
            </div>

            {/* Label */}
            <div className="relative text-xs font-semibold text-ink mb-1
                            group-hover:text-white transition-colors duration-150">
              {item.label}
            </div>

            {/* Desc */}
            <div className="relative text-2xs text-ink-muted leading-relaxed group-hover:text-ink-muted
                            transition-colors duration-150">
              {item.desc}
            </div>

            {/* Hover arrow */}
            <div className="absolute bottom-3 right-3 text-xs opacity-0 group-hover:opacity-60
                            transition-opacity duration-200 translate-x-1 group-hover:translate-x-0"
              style={{ color: item.accent }}>→</div>
          </button>
        ))}
      </div>

      <div className="mt-5 text-2xs text-ink-faint text-center select-none">
        Alt+Y · Data menu &nbsp;·&nbsp; F9 · Reports &nbsp;·&nbsp; Esc · Back
      </div>
    </div>
  )
}
