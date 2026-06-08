import { create } from 'zustand'
import type { Ledger, Voucher } from '../bridge/interop'

export type Screen =
  | 'home'
  | 'ledger-list'
  | 'ledger-create'
  | 'voucher-list'
  | 'voucher-entry'
  | 'trial-balance'
  | 'daybook'
  | 'ledger-vouchers'
  | 'company-select'
  | 'poc-test'
  | 'outstandings'
  | 'stock-summary'

export interface AppState {
  // Navigation
  screen: Screen
  screenStack: Screen[]
  setScreen: (s: Screen) => void
  goBack: () => void

  // Company
  companyName: string | null
  setCompany: (name: string) => void

  // Data cache
  ledgers: Ledger[]
  setLedgers: (l: Ledger[]) => void
  addLedger: (l: Ledger) => void

  vouchers: Voucher[]
  setVouchers: (v: Voucher[]) => void

  editVoucher: Voucher | null
  setEditVoucher: (v: Voucher | null) => void

  // Drill-down context
  drillLedgerId: number | null
  setDrillLedgerId: (id: number | null) => void

  editVoucherId: number | null
  setEditVoucherId: (id: number | null) => void

  // Status
  statusMessage: string
  statusType: 'info' | 'error' | 'success'
  setStatus: (msg: string, type?: 'info' | 'error' | 'success') => void
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'company-select',
  screenStack: [],
  setScreen: (s) => {
    const current = get().screen
    set({ screen: s, screenStack: [...get().screenStack, current] })
  },
  goBack: () => {
    const stack = [...get().screenStack]
    const prev = stack.pop() ?? 'home'
    set({ screen: prev, screenStack: stack })
  },

  companyName: null,
  setCompany: (name) => set({ companyName: name }),

  ledgers: [],
  setLedgers: (l) => set({ ledgers: l }),
  addLedger: (l) => set(s => ({ ledgers: [...s.ledgers, l] })),

  vouchers: [],
  setVouchers: (v) => set({ vouchers: v }),

  editVoucher: null,
  setEditVoucher: (v) => set({ editVoucher: v }),

  drillLedgerId: null,
  setDrillLedgerId: (id) => set({ drillLedgerId: id }),

  editVoucherId: null,
  setEditVoucherId: (id) => set({ editVoucherId: id }),

  statusMessage: 'Ready',
  statusType: 'info',
  setStatus: (msg, type = 'info') => set({ statusMessage: msg, statusType: type }),
}))
