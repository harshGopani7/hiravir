/**
 * LedgerAutoSuggest
 *
 * Self-contained typeahead for ledger selection inside journal entry grids.
 *
 * Keyboard contract (fully isolated — all keys stopPropagation when open):
 *   Any printable char  → opens dropdown, filters results
 *   ArrowDown / ArrowUp → move active item, never leaves input
 *   Enter               → commit selection, close, call onSelect + onCommit
 *   Escape              → clear input, close dropdown
 *   Tab                 → commit if item active, else clear; always move to next field
 *
 * Focus contract:
 *   - The <input> is the only focusable element.
 *   - Dropdown items are rendered with data-idx attributes and highlighted via CSS only;
 *     they are never focused. This prevents any focus loop.
 *   - onCommit() is called after selection so the parent can move focus to Amount cell.
 */
import {
  useState, useRef, useEffect, useCallback,
  type KeyboardEvent, type ChangeEvent,
} from 'react'
import { useLedgerSearch } from '../hooks/useLedgerSearch'
import type { Ledger } from '../bridge/interop'

interface Props {
  ledgers: Ledger[]
  value: number              // currently selected ledgerId (0 = none)
  onSelect: (ledger: Ledger) => void
  onCommit: () => void       // called after Enter-select: parent moves focus to Amount
  allowedIds?: Set<number>   // if set, only ledgers with these IDs appear in results
  placeholder?: string
  tabIndex?: number
}

export function LedgerAutoSuggest({
  ledgers, value, onSelect, onCommit, allowedIds, placeholder = 'Type to search…', tabIndex,
}: Props) {
  const [query, setQuery]       = useState('')
  const [open, setOpen]         = useState(false)
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLUListElement>(null)

  // Derive display text from currently selected ledgerId
  const selectedLedger = value > 0 ? ledgers.find(l => l.id === value) : null
  const displayText    = open ? query : (selectedLedger?.name ?? '')

  const results = useLedgerSearch(ledgers, query, allowedIds)

  // Clamp activeIdx when results length changes
  useEffect(() => {
    setActiveIdx(prev => Math.min(prev, Math.max(0, results.length - 1)))
  }, [results.length])

  // Scroll active item into view without ever moving DOM focus
  useEffect(() => {
    if (!open || !listRef.current) return
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIdx, open])

  // ── Commit selection ──────────────────────────────────────────────────────
  const commit = useCallback((ledger: Ledger) => {
    onSelect(ledger)
    setQuery('')
    setOpen(false)
    setActiveIdx(0)
    // Tiny RAF delay so React flushes state before parent moves focus
    requestAnimationFrame(() => onCommit())
  }, [onSelect, onCommit])

  // ── Input handlers ────────────────────────────────────────────────────────
  const handleChange = useCallback((e: ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value
    setQuery(q)
    setOpen(q.trim().length > 0)
    setActiveIdx(0)
  }, [])

  const handleFocus = useCallback(() => {
    // Reopen on re-focus if there's a query already
    if (query.trim().length > 0) setOpen(true)
  }, [query])

  const handleBlur = useCallback(() => {
    // Delay so a click on a dropdown item fires before close
    setTimeout(() => {
      setOpen(false)
      // If user blurred without selecting, restore previous selection name
      setQuery('')
    }, 150)
  }, [])

  // ── Keyboard handler — fully isolated, all keys stopped when open ─────────
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLInputElement>) => {
    if (open) {
      // Always consume these keys when dropdown is open
      if (e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setActiveIdx(i => Math.min(i + 1, results.length - 1))
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setActiveIdx(i => Math.max(i - 1, 0))
        return
      }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        if (results[activeIdx]) commit(results[activeIdx].ledger)
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        setOpen(false)
        setQuery('')
        setActiveIdx(0)
        return
      }
      if (e.key === 'Tab') {
        // Commit active item on Tab if one exists
        if (results[activeIdx]) {
          e.preventDefault(); e.stopPropagation()
          commit(results[activeIdx].ledger)
        } else {
          setOpen(false)
          setQuery('')
        }
        return
      }
      // All other keys: let them update the query naturally but stop propagation
      // to prevent global keyboard handler from firing
      e.stopPropagation()
      return
    }

    // Dropdown closed — Enter on a valid selection = move focus to amount
    if (e.key === 'Enter' && value > 0) {
      e.preventDefault(); e.stopPropagation()
      onCommit()
      return
    }
  }, [open, results, activeIdx, commit, value, onCommit])

  // ── Mouse click on item ───────────────────────────────────────────────────
  const handleItemMouseDown = useCallback((ledger: Ledger) => {
    // mousedown fires before blur; we commit immediately
    commit(ledger)
    inputRef.current?.focus()
  }, [commit])

  return (
    <div className="relative w-full">
      <input
        ref={inputRef}
        tabIndex={tabIndex}
        className={`tally-input w-full px-1 py-0.5 border-r border-tally-border bg-transparent
          focus:bg-tally-accent focus:outline-none
          ${value > 0 && !open ? 'text-tally-text' : 'text-tally-text'}`}
        value={displayText}
        placeholder={placeholder}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        autoComplete="off"
        spellCheck={false}
      />

      {/* Dropdown */}
      {open && results.length > 0 && (
        <ul
          ref={listRef}
          className="absolute left-0 z-50 w-72 max-h-56 overflow-y-auto
                     bg-tally-panel border border-tally-border shadow-lg
                     text-xs font-mono"
          // Prevent blur on input when clicking the list container
          onMouseDown={e => e.preventDefault()}
        >
          {results.map((m, idx) => (
            <li
              key={m.ledger.id}
              data-idx={idx}
              className={`flex justify-between items-baseline px-2 py-1 cursor-pointer
                border-b border-tally-border/50
                ${idx === activeIdx
                  ? 'bg-tally-highlight text-black'
                  : 'hover:bg-tally-accent text-tally-text'}`}
              onMouseDown={() => handleItemMouseDown(m.ledger)}
              onMouseEnter={() => setActiveIdx(idx)}
            >
              <span className="font-semibold truncate">{m.ledger.name}</span>
              <span className={`text-2xs ml-2 shrink-0 ${idx === activeIdx ? 'text-black/70' : 'text-tally-muted'}`}>
                [{m.groupLabel}]
              </span>
            </li>
          ))}
        </ul>
      )}

      {/* No results hint — includes constraint notice when active */}
      {open && query.trim().length > 0 && results.length === 0 && (
        <div className="absolute left-0 z-50 w-72 bg-tally-panel border border-tally-border
                        px-3 py-2 text-2xs text-tally-muted shadow-lg">
          <div>No match for "{query}"</div>
          {allowedIds && allowedIds.size > 0 && (
            <div className="mt-1 text-tally-yellow">
              ⚠️ Restricted to Cash/Bank accounts for this voucher type
            </div>
          )}
        </div>
      )}
    </div>
  )
}
