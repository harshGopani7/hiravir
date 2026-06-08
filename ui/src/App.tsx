import { useState } from 'react'
import { useAppStore } from './store/appStore'
import { useKeyboard } from './hooks/useKeyboard'
import { DataMenu } from './components/DataMenu'
import { Shell } from './components/Shell'
import { CompanySelect } from './screens/CompanySelect'
import { Home } from './screens/Home'
import { LedgerList } from './screens/LedgerList'
import { LedgerCreate } from './screens/LedgerCreate'
import { VoucherList } from './screens/VoucherList'
import { VoucherEntry } from './screens/VoucherEntry'
import { TrialBalance } from './screens/TrialBalance'
import { Daybook } from './screens/Daybook'
import { LedgerVouchers } from './screens/LedgerVouchers'
import { PocTest } from './screens/PocTest'
import { Outstandings } from './screens/Outstandings'
import { StockSummary } from './screens/StockSummary'

export default function App() {
  const { screen, goBack } = useAppStore()
  const [showDataMenu, setShowDataMenu] = useState(false)

  // Global Escape = go back; Alt+Y = data menu
  useKeyboard((action) => {
    if (action === 'data-menu') { setShowDataMenu(v => !v); return }
    if (action === 'back' && showDataMenu) { setShowDataMenu(false); return }
    if (action === 'back' && screen !== 'home' && screen !== 'company-select') {
      goBack()
    }
  })

  const renderScreen = () => {
    switch (screen) {
      case 'company-select': return <CompanySelect />
      case 'home':           return <Home />
      case 'ledger-list':    return <LedgerList />
      case 'ledger-create':  return <LedgerCreate />
      case 'voucher-list':   return <VoucherList />
      case 'voucher-entry':  return <VoucherEntry />
      case 'trial-balance':  return <TrialBalance />
      case 'daybook':        return <Daybook />
      case 'ledger-vouchers': return <LedgerVouchers />
      case 'poc-test':       return <PocTest />
      case 'outstandings':   return <Outstandings />
      case 'stock-summary':  return <StockSummary />
      default:               return <Home />
    }
  }

  return (
    <Shell>
      {renderScreen()}
      {showDataMenu && <DataMenu onClose={() => setShowDataMenu(false)} />}
    </Shell>
  )
}
