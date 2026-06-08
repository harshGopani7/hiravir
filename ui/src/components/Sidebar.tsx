import { useAppStore, type Screen } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

interface NavItem { label: string; screen: Screen; key?: string; icon: string; section?: string }

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',     screen: 'home',           icon: '⊞', section: 'Main' },
  { label: 'Accounts',      screen: 'ledger-list',    icon: '◫', key: 'A', section: 'Books' },
  { label: 'New Ledger',    screen: 'ledger-create',  icon: '+', key: 'L', section: 'Books' },
  { label: 'Voucher Entry', screen: 'voucher-entry',  icon: '✎', key: 'V', section: 'Transactions' },
  { label: 'Vouchers',      screen: 'voucher-list',   icon: '≡', key: 'B', section: 'Transactions' },
  { label: 'Daybook',       screen: 'daybook',        icon: '◷', key: 'D', section: 'Transactions' },
  { label: 'Trial Balance', screen: 'trial-balance',  icon: '⊜', key: 'T', section: 'Reports' },
  { label: 'Outstandings',  screen: 'outstandings',   icon: '◈', key: 'O', section: 'Reports' },
  { label: 'Stock Summary', screen: 'stock-summary',  icon: '⬡', key: 'S', section: 'Reports' },
]

export function Sidebar() {
  const { screen, setScreen } = useAppStore()

  useKeyboard((action) => {
    if (action === 'report') setScreen('trial-balance')
  })

  const sections = [...new Set(NAV_ITEMS.map(i => i.section))]

  return (
    <nav className="w-44 shrink-0 flex flex-col overflow-hidden"
      style={{ background: '#111827', borderRight: '1px solid rgba(46,61,85,0.6)' }}>

      <div className="flex-1 overflow-y-auto overflow-x-hidden py-2">
        {sections.map(sec => (
          <div key={sec}>
            <div className="px-3 pt-3 pb-1 text-2xs font-semibold uppercase tracking-widest text-ink-faint select-none">
              {sec}
            </div>
            {NAV_ITEMS.filter(i => i.section === sec).map(item => {
              const isActive = screen === item.screen
              return (
                <button
                  key={item.screen}
                  onClick={() => setScreen(item.screen)}
                  className={`sidebar-item w-full text-left ${isActive ? 'active' : ''}`}
                >
                  <span className={`text-sm w-4 shrink-0 text-center leading-none
                    ${isActive ? 'text-brand-light' : 'text-ink-muted'}`}>
                    {item.icon}
                  </span>
                  <span className="flex-1 truncate">{item.label}</span>
                  {item.key && (
                    <span className={`text-2xs font-mono px-1 py-0.5 rounded shrink-0
                      ${isActive
                        ? 'text-brand-light bg-brand/15'
                        : 'text-ink-faint bg-surface-800/60'}`}>
                      {item.key}
                    </span>
                  )}
                </button>
              )
            })}
          </div>
        ))}
      </div>

      <div className="px-3 py-2 border-t border-surface-600/40 text-2xs text-ink-faint">
        Alt+Y data menu
      </div>
    </nav>
  )
}
