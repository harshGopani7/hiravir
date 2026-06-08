import { useState, useRef, useEffect, useCallback } from 'react'
import type { StockItem } from '../bridge/interop'

interface Props {
  items: StockItem[]
  value: number           // stockItemId; 0 = none
  onSelect: (item: StockItem) => void
  onCommit: () => void    // called after selection confirmed (Enter / click)
  placeholder?: string
  tabIndex?: number
}

/** Score query match against candidate name — higher = better */
function score(query: string, name: string): number {
  const q = query.toLowerCase()
  const n = name.toLowerCase()
  if (n === q) return 3
  if (n.startsWith(q)) return 2
  if (n.includes(q)) return 1
  return 0
}

export function ItemAutoSuggest({ items, value, onSelect, onCommit, placeholder, tabIndex }: Props) {
  const [query, setQuery]       = useState('')
  const [open, setOpen]         = useState(false)
  const [hiIdx, setHiIdx]       = useState(0)
  const inputRef  = useRef<HTMLInputElement>(null)
  const listRef   = useRef<HTMLDivElement>(null)

  // Derive display text from selected id
  const selected = items.find(i => i.id === value)

  useEffect(() => {
    setQuery(selected?.name ?? '')
  }, [value, selected])

  const filtered = query.length === 0
    ? items
    : items
        .map(i => ({ item: i, s: score(query, i.name) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .map(x => x.item)

  const commit = useCallback((item: StockItem) => {
    onSelect(item)
    setQuery(item.name)
    setOpen(false)
    setHiIdx(0)
    setTimeout(onCommit, 0)
  }, [onSelect, onCommit])

  const handleKey = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === 'ArrowDown' || e.key === 'Enter') { setOpen(true); e.preventDefault() }
      return
    }
    if (e.key === 'ArrowDown') { setHiIdx(i => Math.min(i + 1, filtered.length - 1)); e.preventDefault() }
    else if (e.key === 'ArrowUp') { setHiIdx(i => Math.max(i - 1, 0)); e.preventDefault() }
    else if (e.key === 'Enter') {
      if (filtered[hiIdx]) commit(filtered[hiIdx])
      e.preventDefault(); e.stopPropagation()
    }
    else if (e.key === 'Escape') { setOpen(false); e.preventDefault() }
    else if (e.key === 'Tab') {
      if (filtered[hiIdx]) commit(filtered[hiIdx])
      setOpen(false)
    }
  }

  return (
    <div className="relative" data-item-row>
      <input
        ref={inputRef}
        tabIndex={tabIndex}
        className="tally-input px-2 border-r border-tally-border focus:bg-tally-accent focus:outline-none w-full"
        placeholder={placeholder ?? 'Type item name…'}
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); setHiIdx(0) }}
        onFocus={() => { setOpen(true); setHiIdx(0) }}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={handleKey}
      />
      {open && filtered.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-40 left-0 top-full min-w-[220px] max-h-48 overflow-y-auto
                     bg-tally-panel border border-tally-blue shadow-xl"
        >
          {filtered.map((item, idx) => (
            <div
              key={item.id}
              className={`px-2 py-1 text-2xs cursor-pointer flex items-center justify-between gap-2
                ${idx === hiIdx ? 'bg-tally-blue text-white' : 'hover:bg-tally-accent'}`}
              onMouseDown={() => commit(item)}
              onMouseEnter={() => setHiIdx(idx)}
            >
              <span className="truncate">{item.name}</span>
              <span className="text-tally-muted shrink-0 font-mono text-2xs">{item.unitOfMeasure}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
