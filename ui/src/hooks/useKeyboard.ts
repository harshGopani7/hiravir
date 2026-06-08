import { useEffect, useCallback, useRef } from 'react'

export type KeyAction =
  | 'submit'         // Enter
  | 'back'           // Escape
  | 'up'             // ArrowUp
  | 'down'           // ArrowDown
  | 'tab'            // Tab
  | 'shifttab'       // Shift+Tab
  | 'delete'         // Delete / F8
  | 'new'            // Alt+C / F2
  | 'save'           // Ctrl+S
  | 'help'           // F1
  | 'report'         // F9
  | 'alter'          // Ctrl+A
  | 'vtype-contra'    // F4
  | 'vtype-payment'   // F5
  | 'vtype-receipt'   // F6 (non-Ctrl)
  | 'vtype-journal'   // F7
  | 'delete-voucher'  // Alt+D
  | 'cancel-voucher'  // Alt+X
  | 'data-menu'       // Alt+Y
  | 'print-document'  // Alt+P
  | 'item-invoice'    // Alt+I
  | 'view-edit-log'   // Alt+Q

export type KeyHandler = (action: KeyAction, event: KeyboardEvent) => void

const KEY_MAP: Record<string, KeyAction> = {
  Enter:    'submit',
  Escape:   'back',
  ArrowUp:  'up',
  ArrowDown:'down',
  Tab:      'tab',
  F1:       'help',
  F2:       'new',
  F4:       'vtype-contra',
  F5:       'vtype-payment',
  F7:       'vtype-journal',
  F8:       'delete',
  F9:       'report',
}

/**
 * Global keyboard event listener — registers once, dispatches to all subscribers.
 * Tally-style: Enter moves focus forward, Escape pops screen, F-keys trigger actions.
 */
const subscribers = new Set<KeyHandler>()
let globalHandlerRegistered = false

function registerGlobalHandler() {
  if (globalHandlerRegistered) return
  globalHandlerRegistered = true

  document.addEventListener('keydown', (e: KeyboardEvent) => {
    let action: KeyAction | null = null

    if (e.ctrlKey && e.key === 's') { action = 'save'; }
    else if (e.ctrlKey && e.key === 'a') { action = 'alter'; }
    else if (e.shiftKey && e.key === 'Tab') { action = 'shifttab'; }
    else if (e.altKey && e.key === 'c') { action = 'new'; }
    else if (e.altKey && e.key === 'd') { action = 'delete-voucher'; }
    else if (e.altKey && e.key === 'x') { action = 'cancel-voucher'; }
    else if (e.altKey && e.key === 'y') { action = 'data-menu'; }
    else if (e.altKey && e.key === 'p') { action = 'print-document'; }
    else if (e.altKey && e.key === 'i') { action = 'item-invoice'; }
    else if (e.altKey && e.key === 'q') { action = 'view-edit-log'; }
    else if (e.key === 'F6' && !e.ctrlKey) { action = 'vtype-receipt'; }
    else { action = KEY_MAP[e.key] ?? null }

    if (!action) return

    // Prevent default browser behavior for all handled keys
    if (['F1','F2','F4','F5','F6','F7','F8','F9','Escape'].includes(e.key) ||
        (e.ctrlKey && ['s','a'].includes(e.key)) ||
        (e.altKey  && ['d','x','c','y','p','i','q'].includes(e.key))) {
      e.preventDefault()
    }

    subscribers.forEach(h => h(action!, e))
  })
}

/** Hook to subscribe to keyboard actions within a component's lifecycle */
export function useKeyboard(handler: KeyHandler, deps: unknown[] = []) {
  const handlerRef = useRef(handler)
  handlerRef.current = handler

  useEffect(() => {
    registerGlobalHandler()
    const fn: KeyHandler = (a, e) => handlerRef.current(a, e)
    subscribers.add(fn)
    return () => { subscribers.delete(fn) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
}

/** Focus the next/prev focusable element in the DOM */
export function moveFocus(direction: 'next' | 'prev') {
  const focusable = Array.from(
    document.querySelectorAll<HTMLElement>(
      'input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )
  ).filter(el => el.offsetParent !== null)

  const current = document.activeElement as HTMLElement
  const idx = focusable.indexOf(current)
  if (idx === -1) { focusable[0]?.focus(); return }

  const next = direction === 'next'
    ? focusable[(idx + 1) % focusable.length]
    : focusable[(idx - 1 + focusable.length) % focusable.length]

  next?.focus()
}

/** Hook for arrow-key row navigation (for lists/grids) */
export function useRowNavigation(
  rowCount: number,
  onSelect: (idx: number) => void
) {
  const selectedRef = useRef(0)

  const navigate = useCallback((action: KeyAction) => {
    if (action === 'up') {
      selectedRef.current = Math.max(0, selectedRef.current - 1)
      onSelect(selectedRef.current)
    } else if (action === 'down') {
      selectedRef.current = Math.min(rowCount - 1, selectedRef.current + 1)
      onSelect(selectedRef.current)
    }
  }, [rowCount, onSelect])

  return { navigate, selectedIdx: selectedRef.current }
}
