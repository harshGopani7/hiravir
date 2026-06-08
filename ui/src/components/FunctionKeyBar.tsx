const KEYS = [
  { key: 'F2',      label: 'New',     color: 'text-brand-light' },
  { key: 'Ctrl+S',  label: 'Save',    color: 'text-success-light' },
  { key: 'F9',      label: 'Refresh', color: 'text-info-light' },
  { key: 'Alt+D',   label: 'Delete',  color: 'text-danger-light' },
  { key: 'Alt+X',   label: 'Cancel',  color: 'text-warning-light' },
  { key: 'Alt+Q',   label: 'Audit',   color: 'text-brand-light' },
  { key: 'Alt+P',   label: 'Print',   color: 'text-ink-muted' },
  { key: 'Alt+Y',   label: 'Data',    color: 'text-ink-muted' },
  { key: 'Esc',     label: 'Back',    color: 'text-ink-muted' },
]

export function FunctionKeyBar() {
  return (
    <div className="flex items-center gap-1 px-3 py-1 shrink-0 overflow-x-auto border-t border-surface-600/40"
      style={{ background: 'rgba(13,17,23,0.9)', backdropFilter: 'blur(8px)' }}>
      {KEYS.map(k => (
        <div key={k.key}
          className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-surface-600/60
                     bg-surface-800/80 text-2xs whitespace-nowrap select-none shrink-0
                     hover:border-surface-500/60 transition-colors duration-150">
          <span className={`font-mono font-semibold ${k.color}`}>{k.key}</span>
          <span className="text-ink-faint">{k.label}</span>
        </div>
      ))}
    </div>
  )
}
