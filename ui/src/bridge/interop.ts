/**
 * Hiravir Interop Bridge
 * Wraps window.hiravir.dispatch for typed zero-HTTP C# calls.
 * Falls back to mock mode when running in Vite dev server (no MAUI host).
 */

export interface BridgeResponse<T = unknown> {
  ok: boolean
  data?: T
  error?: string
}

declare global {
  interface Window {
    hiravir: {
      dispatch: (method: string, payload: unknown) => Promise<BridgeResponse>
      registerBridge: (ref: unknown) => void
      unregisterBridge: () => void
      _bridge: unknown | null
    }
    __hiravir_onready?: () => void
  }
}

const isMauiHost = (): boolean =>
  typeof window !== 'undefined' && !!window.hiravir?._bridge

/** Wait for MAUI bridge to become available (max 5s) */
export function waitForBridge(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (isMauiHost()) { resolve(); return }
    const timeout = setTimeout(() => reject(new Error('Bridge timeout')), 5000)
    window.__hiravir_onready = () => { clearTimeout(timeout); resolve() }
  })
}

/** Core typed dispatch */
export async function dispatch<T = unknown>(
  method: string,
  payload: unknown = {}
): Promise<BridgeResponse<T>> {
  if (!window.hiravir?._bridge) {
    // Dev mode: use mock backend
    return mockDispatch<T>(method, payload)
  }
  return window.hiravir.dispatch(method, payload) as Promise<BridgeResponse<T>>
}

export interface DataOpResult {
  cancelled: boolean
  path: string | null
}

// ── Typed API helpers ────────────────────────────────────────────────────────

export const api = {
  company: {
    list:   () => dispatch<string[]>('company.list'),
    create: (p: CreateCompanyPayload) => dispatch('company.create', p),
    open:   (dbPath: string) => dispatch('company.open', { dbPath }),
  },
  ledger: {
    list:   () => dispatch<Ledger[]>('ledger.list'),
    tree:   () => dispatch<Ledger[]>('ledger.tree'),
    create: (p: CreateLedgerPayload) => dispatch<Ledger>('ledger.create', p),
  },
  voucher: {
    save:   (v: VoucherPayload) => dispatch<Voucher>('voucher.save', v),
    update: (v: Voucher) => dispatch<Voucher>('voucher.update', v),
    list:   (p: VoucherListPayload) => dispatch<Voucher[]>('voucher.list', p),
    get:    (id: number) => dispatch<Voucher>('voucher.get', { id }),
    delete:  (id: number) => dispatch('voucher.delete', { id }),
    cancel:  (id: number) => dispatch('voucher.cancel', { id }),
    editLog: (id: number) => dispatch<EditLogEntry[]>('voucher.editLog', { id }),
  },
  report: {
    trialBalance: () => dispatch<TrialBalanceGroup[]>('report.trialBalance'),
    daybook: (from: string, to: string) => dispatch<DaybookResult>('report.daybook', { from, to }),
    ledgerStatement: (ledgerId: number, from: string, to: string) =>
      dispatch<LedgerStatementResult>('report.ledgerStatement', { ledgerId, from, to }),
    outstanding: () => dispatch<OutstandingRow[]>('report.outstanding'),
    stockSummary: () => dispatch<StockSummaryRow[]>('report.stockSummary'),
  },
  stock: {
    listItems:   () => dispatch<StockItem[]>('stock.item.list'),
    createGroup: (p: { parentId?: number | null; name: string }) => dispatch<StockGroup>('stock.group.create', p),
    createItem:  (p: { groupId?: number | null; name: string; unitOfMeasure?: string }) => dispatch<StockItem>('stock.item.create', p),
    saveInvoice: (p: SaveInvoicePayload) => dispatch<Voucher>('voucher.saveInvoice', p),
  },
  poc: {
    submitVoucher: (v: VoucherPayload) => dispatch<PocResult>('voucher.poc', v),
  },
  data: {
    backup:  () => dispatch<DataOpResult>('data.backup'),
    export:  () => dispatch<DataOpResult>('data.export'),
    restore: () => dispatch<DataOpResult>('data.restore'),
  },
}

// ── Domain types (mirroring C# models) ──────────────────────────────────────

export type LedgerGroup = 'Assets' | 'Liabilities' | 'Capital' | 'Income' | 'Expenses'

export interface Ledger {
  id: number
  parentId: number | null
  name: string
  group: LedgerGroup
  isGroup: boolean
  maintainBillWise: boolean
  balance: number
  children?: Ledger[]
}

export interface BillAllocation {
  id?: number
  journalLineId?: number
  refType: 'New Ref' | 'Agst Ref' | 'Advance' | 'On Account'
  refName: string
  amount: number
}

export interface JournalLine {
  id?: number
  voucherId?: number
  ledgerId: number
  ledgerName?: string
  debitAmount: number
  creditAmount: number
  narration?: string
  billAllocations?: BillAllocation[]
}

export interface OutstandingRow {
  ledgerId: number
  ledgerName: string
  refName: string
  pendingAmount: number
}

export interface StockGroup {
  id: number
  parentId?: number | null
  name: string
  totalQuantity: number
  totalValue: number
  children?: StockGroup[]
  items?: StockItem[]
}

export interface StockItem {
  id: number
  groupId?: number | null
  name: string
  unitOfMeasure: string
  quantity: number
  value: number
}

export interface InventoryEntry {
  id?: number
  voucherId?: number
  stockItemId: number
  itemName: string
  quantity: number
  rate: number
  amount: number
  isInward: boolean
}

export interface StockSummaryRow {
  id: number
  parentId?: number | null
  name: string
  unit: string
  isGroup: boolean
  quantity: number
  value: number
  rate: number
  children: StockSummaryRow[]
}

export interface EditLogEntry {
  id: string
  voucherId: number
  actionType: 'Created' | 'Altered' | 'Cancelled' | 'Deleted'
  timestamp: number    // Unix ms UTC
  previousState?: string | null  // JSON string of prior Voucher
}

export interface InvoiceItem {
  stockItemId: number
  itemName: string
  quantity: number
  rate: number
  amount: number
}

export interface SaveInvoicePayload {
  voucherType: string
  date: string
  voucherNumber: string
  narration?: string
  partyLedgerId: number
  tradingLedgerId: number
  items: InvoiceItem[]
}

export type VoucherType = 'Payment' | 'Receipt' | 'Contra' | 'Journal' |
                          'Sales' | 'Purchase' | 'CreditNote' | 'DebitNote'

export interface Voucher {
  id?: number
  type: VoucherType
  date: string
  voucherNumber: string
  narration?: string
  flexiFields?: Record<string, unknown>
  lines: JournalLine[]
}

export interface TrialBalanceLine {
  id: number
  name: string
  groupName: string
  debit: number
  credit: number
}

export interface TbLedgerRow {
  id: number
  name: string
  isGroup: false
  debit: number
  credit: number
  balance: number
}

export interface TbGroupRow {
  id: number
  name: string
  isGroup: true
  subtotalDebit: number
  subtotalCredit: number
  children: TbLedgerRow[]
}

export interface TrialBalanceGroup {
  group: string
  totalDebit: number
  totalCredit: number
  rows: (TbGroupRow | TbLedgerRow)[]
}

export interface DaybookRow {
  voucherId: number
  date: string
  voucherNumber: string
  voucherType: string
  narration: string
  ledgerId: number
  ledgerName: string
  debit: number
  credit: number
  lineNarration: string
  isCancelled: boolean
}

export interface DaybookResult {
  rows: DaybookRow[]
  totalDebit: number
  totalCredit: number
  from: string
  to: string
}

export interface PocResult {
  voucherId: number
  voucherNumber: string
  lineCount: number
  submitUtc: string
  confirmUtc: string
  totalElapsedMs: number
  validateMs: number
  saveMs: number
  debitTotal: number
  creditTotal: number
  balanced: boolean
}

export interface CreateCompanyPayload {
  name: string
  currencySymbol: string
  fiscalYearStart: string
  fiscalYearEnd: string
}

export interface CreateLedgerPayload {
  parentId: number | null
  name: string
  group: LedgerGroup
  isGroup: boolean
  maintainBillWise?: boolean
}

export interface LedgerStatementLine {
  voucherId: number
  date: string
  voucherType: string
  voucherNumber: string
  narration: string
  lineId: number
  debit: number
  credit: number
  lineNarration: string
  runningBalance: number
  isCancelled: boolean
}

export interface LedgerStatementResult {
  ledgerId: number
  ledgerName: string
  from: string
  to: string
  openingBalance: number
  closingBalance: number
  lines: LedgerStatementLine[]
}

export type VoucherPayload = Omit<Voucher, 'id'>
export interface VoucherListPayload {
  from: string
  to: string
  type?: number
}

// ── Mock backend for Vite dev mode ───────────────────────────────────────────

let mockBillAllocations: (BillAllocation & { journalLineId: number })[] = []
let mockBaIdSeq = 1

// Audit log: voucherId -> entries[]
const mockEditLog = new Map<number, EditLogEntry[]>()

let mockStockGroups: StockGroup[] = [
  { id: 1, parentId: null, name: 'Primary', totalQuantity: 0, totalValue: 0 },
]
let mockStockItems: StockItem[] = [
  { id: 1, groupId: 1, name: 'Sample Item', unitOfMeasure: 'Nos', quantity: 0, value: 0 },
]
let mockStockIdSeq = { group: 2, item: 2 }

let mockLedgers: Ledger[] = [
  { id: 1,  parentId: null, name: 'Cash-in-Hand',      group: 'Assets',      isGroup: true,  maintainBillWise: false, balance: 0 },
  { id: 2,  parentId: 1,    name: 'Cash',               group: 'Assets',      isGroup: false, maintainBillWise: false, balance: 50000 },
  { id: 3,  parentId: null, name: 'Capital Account',    group: 'Capital',     isGroup: true,  maintainBillWise: false, balance: 0 },
  { id: 4,  parentId: 3,    name: 'Owner Capital',      group: 'Capital',     isGroup: false, maintainBillWise: false, balance: -50000 },
  { id: 5,  parentId: null, name: 'Sales Accounts',     group: 'Income',      isGroup: true,  maintainBillWise: false, balance: 0 },
  { id: 6,  parentId: 5,    name: 'Sales',              group: 'Income',      isGroup: false, maintainBillWise: false, balance: -100000 },
  { id: 7,  parentId: null, name: 'Purchase Accounts',  group: 'Expenses',    isGroup: true,  maintainBillWise: false, balance: 0 },
  { id: 8,  parentId: 7,    name: 'Purchases',          group: 'Expenses',    isGroup: false, maintainBillWise: false, balance: 80000 },
  { id: 9,  parentId: null, name: 'Bank Accounts',      group: 'Assets',      isGroup: true,  maintainBillWise: false, balance: 0 },
  { id: 10, parentId: 9,    name: 'Primary Bank',       group: 'Assets',      isGroup: false, maintainBillWise: false, balance: 20000 },
  { id: 11, parentId: null, name: 'Sundry Debtors',     group: 'Assets',      isGroup: true,  maintainBillWise: false, balance: 0 },
  { id: 12, parentId: null, name: 'Sundry Creditors',   group: 'Liabilities', isGroup: true,  maintainBillWise: false, balance: 0 },
]

let mockVouchers: Voucher[] = [
  {
    id: 1,
    type: 'Sales',
    date: '2024-04-01',
    voucherNumber: 'SL-001',
    narration: 'Opening sales',
    lines: [
      { id: 1, voucherId: 1, ledgerId: 10, ledgerName: 'Primary Bank', debitAmount: 100000, creditAmount: 0 },
      { id: 2, voucherId: 1, ledgerId: 6,  ledgerName: 'Sales',        debitAmount: 0, creditAmount: 100000 },
    ]
  }
]

let mockIdSeq = { ledger: 11, voucher: 2 }

async function mockDispatch<T>(method: string, payload: unknown): Promise<BridgeResponse<T>> {
  await new Promise(r => setTimeout(r, 2)) // simulate sub-ms latency
  const p = payload as Record<string, unknown>

  switch (method) {
    case 'company.list':
      return { ok: true, data: ['Demo Company'] as unknown as T }

    case 'company.create':
    case 'company.open':
      return { ok: true, data: { id: 1, name: 'Demo Company', currencySymbol: '₹' } as unknown as T }

    case 'ledger.list':
      return { ok: true, data: mockLedgers as unknown as T }

    case 'ledger.tree': {
      const roots = buildTree(mockLedgers)
      return { ok: true, data: roots as unknown as T }
    }

    case 'ledger.create': {
      const l: Ledger = { ...(p as unknown as Ledger), id: mockIdSeq.ledger++, balance: 0, maintainBillWise: !!(p as Record<string,unknown>)['maintainBillWise'] }
      mockLedgers.push(l)
      return { ok: true, data: l as unknown as T }
    }

    case 'voucher.save': {
      const v = p as unknown as Voucher
      if (!verifyBalance(v.lines)) return { ok: false, error: 'Voucher does not balance' }
      const vId = mockIdSeq.voucher++
      const savedLines = v.lines.map((l, li) => {
        const lId = vId * 100 + li
        if (l.billAllocations) {
          l.billAllocations.forEach(ba => {
            mockBillAllocations.push({ ...ba, id: mockBaIdSeq++, journalLineId: lId })
          })
        }
        return { ...l, id: lId, voucherId: vId }
      })
      const saved: Voucher = { ...v, id: vId, lines: savedLines }
      mockVouchers.push(saved)
      // Audit log
      const existing = mockEditLog.get(vId) ?? []
      existing.push({ id: crypto.randomUUID(), voucherId: vId, actionType: 'Created', timestamp: Date.now(), previousState: null })
      mockEditLog.set(vId, existing)
      return { ok: true, data: saved as unknown as T }
    }

    case 'voucher.list':
      return { ok: true, data: mockVouchers as unknown as T }

    case 'voucher.get': {
      const v = mockVouchers.find(x => x.id === p['id'])
      return v ? { ok: true, data: v as unknown as T } : { ok: false, error: 'Not found' }
    }

    case 'voucher.delete': {
      const dId = p['id'] as number
      const prev = mockVouchers.find(x => x.id === dId)
      if (prev) {
        const log = mockEditLog.get(dId) ?? []
        log.push({ id: crypto.randomUUID(), voucherId: dId, actionType: 'Deleted', timestamp: Date.now(), previousState: JSON.stringify(prev) })
        mockEditLog.set(dId, log)
      }
      mockVouchers = mockVouchers.filter(x => x.id !== dId)
      return { ok: true, data: { deleted: true } as unknown as T }
    }

    case 'voucher.cancel': {
      const idx = mockVouchers.findIndex(x => x.id === p['id'])
      if (idx === -1) return { ok: false, error: 'Not found' }
      if ((mockVouchers[idx] as Voucher & { isCancelled?: boolean }).isCancelled)
        return { ok: false, error: 'Already cancelled' }
      const cId = p['id'] as number
      const cPrev = mockVouchers[idx]
      const cLog = mockEditLog.get(cId) ?? []
      cLog.push({ id: crypto.randomUUID(), voucherId: cId, actionType: 'Cancelled', timestamp: Date.now(), previousState: JSON.stringify(cPrev) })
      mockEditLog.set(cId, cLog)
      mockVouchers[idx] = { ...mockVouchers[idx], isCancelled: true } as Voucher
      return { ok: true, data: { cancelled: true } as unknown as T }
    }

    case 'voucher.update': {
      const v = p as unknown as Voucher
      if (!verifyBalance(v.lines)) return { ok: false, error: 'Voucher does not balance' }
      const idx = mockVouchers.findIndex(x => x.id === v.id)
      if (idx === -1) return { ok: false, error: 'Not found' }
      // Remove old bill allocations for this voucher's lines
      const oldLineIds = (mockVouchers[idx].lines ?? []).map(l => l.id).filter(Boolean)
      mockBillAllocations = mockBillAllocations.filter(ba => !oldLineIds.includes(ba.journalLineId))
      // Re-save new lines with allocations
      const updatedLines = v.lines.map((l, li) => {
        const lId = (v.id ?? 0) * 100 + li
        if (l.billAllocations) {
          l.billAllocations.forEach(ba => {
            mockBillAllocations.push({ ...ba, id: mockBaIdSeq++, journalLineId: lId })
          })
        }
        return { ...l, id: lId, voucherId: v.id }
      })
      const uPrev = mockVouchers[idx]
      const uId = v.id as number
      mockVouchers[idx] = { ...v, lines: updatedLines }
      const uLog = mockEditLog.get(uId) ?? []
      uLog.push({ id: crypto.randomUUID(), voucherId: uId, actionType: 'Altered', timestamp: Date.now(), previousState: JSON.stringify(uPrev) })
      mockEditLog.set(uId, uLog)
      return { ok: true, data: mockVouchers[idx] as unknown as T }
    }

    case 'voucher.editLog': {
      const elId = p['id'] as number
      const entries = (mockEditLog.get(elId) ?? []).slice().reverse()
      return { ok: true, data: entries as unknown as T }
    }

    case 'voucher.poc': {
      const v = p as unknown as Voucher
      const lines = v.lines ?? []
      const totalDr = lines.reduce((s, l) => s + (l.debitAmount || 0), 0)
      const totalCr = lines.reduce((s, l) => s + (l.creditAmount || 0), 0)
      const balanced = Math.abs(totalDr - totalCr) < 0.000001
      if (!balanced) return { ok: false, error: `Voucher does not balance: Dr ${totalDr} ≠ Cr ${totalCr}` }
      // Simulate sub-ms C# timing (realistic mock values)
      const tValidate = 0.04 + Math.random() * 0.06    // 40–100 µs
      const tSave     = 0.3  + Math.random() * 0.4     // 0.3–0.7 ms
      const tTotal    = tValidate + tSave
      const savedId   = mockIdSeq.voucher++
      const now       = new Date().toISOString()
      const result: PocResult = {
        voucherId:      savedId,
        voucherNumber:  v.voucherNumber || `POC-${savedId}`,
        lineCount:      lines.filter(l => l.debitAmount > 0 || l.creditAmount > 0).length,
        submitUtc:      now,
        confirmUtc:     new Date(Date.now() + tTotal).toISOString(),
        totalElapsedMs: tTotal,
        validateMs:     tValidate,
        saveMs:         tSave,
        debitTotal:     totalDr,
        creditTotal:    totalCr,
        balanced,
      }
      mockVouchers.push({ ...v, id: savedId })
      return { ok: true, data: result as unknown as T }
    }

    case 'report.trialBalance': {
      const groupOrder = ['Assets','Liabilities','Capital','Income','Expenses']
      const groups: TrialBalanceGroup[] = groupOrder.map(grpName => {
        const grpLedgers   = mockLedgers.filter(l => l.group === grpName)
        const grpNodes     = grpLedgers.filter(l => l.isGroup)
        const leafLedgers  = grpLedgers.filter(l => !l.isGroup)
        const rows: (TbGroupRow | TbLedgerRow)[] = grpNodes.map(g => {
          const children: TbLedgerRow[] = leafLedgers
            .filter(l => l.parentId === g.id)
            .map(l => ({ id: l.id, name: l.name, isGroup: false as const, debit: l.balance > 0 ? l.balance : 0, credit: l.balance < 0 ? -l.balance : 0, balance: l.balance }))
          return { id: g.id, name: g.name, isGroup: true as const, subtotalDebit: children.reduce((s,c) => s+c.debit, 0), subtotalCredit: children.reduce((s,c) => s+c.credit, 0), children }
        })
        return {
          group: grpName,
          totalDebit:  leafLedgers.reduce((s,l) => s + (l.balance > 0 ? l.balance : 0), 0),
          totalCredit: leafLedgers.reduce((s,l) => s + (l.balance < 0 ? -l.balance : 0), 0),
          rows
        }
      }).filter(g => g.rows.length > 0)
      return { ok: true, data: groups as unknown as T }
    }

    case 'report.ledgerStatement': {
      const { ledgerId: lid, from: sf, to: st } = p as { ledgerId: number; from: string; to: string }
      const ledger = mockLedgers.find(l => l.id === lid)
      if (!ledger) return { ok: false, error: `Ledger ${lid} not found` }
      const relevant = mockVouchers.filter(v => v.date >= sf && v.date <= st)
      let running = 0
      const lines: LedgerStatementLine[] = relevant.flatMap(v => {
        const cancelled = !!(v as Voucher & { isCancelled?: boolean }).isCancelled
        return v.lines
          .filter(l => l.ledgerId === lid)
          .map(l => {
            const dr = cancelled ? 0 : l.debitAmount
            const cr = cancelled ? 0 : l.creditAmount
            running += (dr - cr)
            return {
              voucherId: v.id ?? 0,
              date: v.date,
              voucherType: v.type,
              voucherNumber: v.voucherNumber,
              narration: v.narration ?? '',
              lineId: l.id ?? 0,
              debit: dr,
              credit: cr,
              lineNarration: l.narration ?? '',
              runningBalance: running,
              isCancelled: cancelled,
            }
          })
      })
      const result: LedgerStatementResult = {
        ledgerId: lid, ledgerName: ledger.name,
        from: sf, to: st,
        openingBalance: 0, closingBalance: running, lines,
      }
      return { ok: true, data: result as unknown as T }
    }

    case 'report.daybook': {
      const { from: f, to: t } = p as { from: string; to: string }
      const inRange = mockVouchers.filter(v => v.date >= f && v.date <= t)
      const rows: DaybookRow[] = inRange.flatMap(v =>
        v.lines.map(l => {
          const cancelled = !!(v as Voucher & { isCancelled?: boolean }).isCancelled
          return {
            voucherId: v.id ?? 0,
            date: v.date,
            voucherNumber: v.voucherNumber,
            voucherType: v.type,
            narration: v.narration ?? '',
            ledgerId: l.ledgerId,
            ledgerName: l.ledgerName ?? mockLedgers.find(x => x.id === l.ledgerId)?.name ?? `Ledger#${l.ledgerId}`,
            debit: cancelled ? 0 : l.debitAmount,
            credit: cancelled ? 0 : l.creditAmount,
            lineNarration: l.narration ?? '',
            isCancelled: cancelled,
          }
        })
      )
      const result: DaybookResult = {
        rows, from: f, to: t,
        totalDebit:  rows.reduce((s,r) => s+r.debit, 0),
        totalCredit: rows.reduce((s,r) => s+r.credit, 0),
      }
      return { ok: true, data: result as unknown as T }
    }

    case 'report.stockSummary': {
      const rows: StockSummaryRow[] = mockStockGroups.map(g => {
        const children: StockSummaryRow[] = mockStockItems
          .filter(i => i.groupId === g.id)
          .map(i => ({
            id: i.id, parentId: g.id, name: i.name, unit: i.unitOfMeasure,
            isGroup: false, quantity: i.quantity, value: i.value,
            rate: i.quantity !== 0 ? i.value / i.quantity : 0,
            children: []
          }))
        const totalQty = children.reduce((s, c) => s + c.quantity, 0)
        const totalVal = children.reduce((s, c) => s + c.value, 0)
        return { id: g.id, parentId: g.parentId ?? null, name: g.name, unit: '', isGroup: true,
          quantity: totalQty, value: totalVal, rate: 0, children }
      })
      return { ok: true, data: rows as unknown as T }
    }

    case 'stock.item.list':
      return { ok: true, data: mockStockItems as unknown as T }

    case 'stock.group.create': {
      const g: StockGroup = { ...(p as unknown as StockGroup), id: mockStockIdSeq.group++, totalQuantity: 0, totalValue: 0 }
      mockStockGroups.push(g)
      return { ok: true, data: g as unknown as T }
    }

    case 'stock.item.create': {
      const item: StockItem = { ...(p as unknown as StockItem), id: mockStockIdSeq.item++, quantity: 0, value: 0 }
      mockStockItems.push(item)
      return { ok: true, data: item as unknown as T }
    }

    case 'voucher.saveInvoice': {
      const req = p as unknown as SaveInvoicePayload
      const total = req.items.reduce((s, i) => s + i.amount, 0)
      const isInward = req.voucherType === 'Purchase' || req.voucherType === 'DebitNote'
      const vId = mockIdSeq.voucher++
      // Apply to mock stock items
      req.items.forEach(item => {
        const si = mockStockItems.find(x => x.id === item.stockItemId)
        if (si) {
          if (isInward) { si.quantity += item.quantity; si.value += item.amount }
          else          { si.quantity -= item.quantity; si.value -= item.amount }
        }
      })
      const saved: Voucher = {
        id: vId, type: req.voucherType as VoucherType,
        date: req.date, voucherNumber: req.voucherNumber, narration: req.narration,
        lines: [
          { id: vId*100+0, voucherId: vId, ledgerId: req.partyLedgerId, debitAmount: isInward ? 0 : total, creditAmount: isInward ? total : 0 },
          { id: vId*100+1, voucherId: vId, ledgerId: req.tradingLedgerId, debitAmount: isInward ? total : 0, creditAmount: isInward ? 0 : total },
        ]
      }
      mockVouchers.push(saved)
      return { ok: true, data: saved as unknown as T }
    }

    case 'report.outstanding': {
      // Net up bill allocations: New Ref/Advance/On Account = +amount, Agst Ref = -amount
      const netMap = new Map<string, { ledgerId: number; ledgerName: string; refName: string; net: number }>()
      mockBillAllocations.forEach(ba => {
        const voucherLine = mockVouchers.flatMap(v => v.lines).find(l => l.id === ba.journalLineId)
        if (!voucherLine) return
        const ledger = mockLedgers.find(l => l.id === voucherLine.ledgerId)
        if (!ledger) return
        const key = `${voucherLine.ledgerId}::${ba.refName}`
        const sign = (ba.refType === 'Agst Ref') ? -1 : 1
        const existing = netMap.get(key)
        if (existing) existing.net += sign * ba.amount
        else netMap.set(key, { ledgerId: voucherLine.ledgerId, ledgerName: ledger.name, refName: ba.refName, net: sign * ba.amount })
      })
      const rows: OutstandingRow[] = Array.from(netMap.values())
        .filter(r => Math.abs(r.net) > 0.000001)
        .map(r => ({ ledgerId: r.ledgerId, ledgerName: r.ledgerName, refName: r.refName, pendingAmount: r.net }))
      return { ok: true, data: rows as unknown as T }
    }

    case 'data.backup':
    case 'data.export':
    case 'data.restore': {
      // In mock/dev mode there is no real file system dialog — return a fake path
      const op = method === 'data.backup' ? 'backup' : method === 'data.export' ? 'export' : 'restore'
      const ext = method === 'data.backup' ? '.hirdb' : method === 'data.restore' ? '.hirdb' : '.json'
      const fakePath = `C:\\Users\\dev\\Documents\\Hiravir\\mock_${op}_${Date.now()}${ext}`
      const result: DataOpResult = { cancelled: false, path: fakePath }
      return { ok: true, data: result as unknown as T }
    }

    default:
      return { ok: false, error: `Unknown method: ${method}` }
  }
}

function verifyBalance(lines: JournalLine[]): boolean {
  const totalDebit = lines.reduce((s, l) => s + (l.debitAmount || 0), 0)
  const totalCredit = lines.reduce((s, l) => s + (l.creditAmount || 0), 0)
  return Math.abs(totalDebit - totalCredit) < 0.000001
}

function buildTree(ledgers: Ledger[]): Ledger[] {
  const map = new Map<number, Ledger>()
  ledgers.forEach(l => map.set(l.id, { ...l, children: [] }))
  const roots: Ledger[] = []
  map.forEach(l => {
    if (l.parentId && map.has(l.parentId)) map.get(l.parentId)!.children!.push(l)
    else roots.push(l)
  })
  return roots
}
