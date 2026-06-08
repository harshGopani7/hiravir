import { useEffect, useState } from 'react'
import { useAppStore } from '../store/appStore'

const STATUS_CONFIG = {
  error:   { icon: '✕', color: 'text-danger-light',  dot: 'bg-danger',  bar: 'border-danger/30' },
  success: { icon: '✓', color: 'text-success-light', dot: 'bg-success', bar: 'border-success/30' },
  info:    { icon: '·', color: 'text-ink-muted',      dot: 'bg-ink-muted', bar: 'border-surface-600/40' },
}

export function StatusBar() {
  const { statusMessage, statusType } = useAppStore()
  const [key, setKey] = useState(0)

  useEffect(() => { setKey(k => k + 1) }, [statusMessage])

  const cfg = STATUS_CONFIG[statusType ?? 'info']

  return (
    <div className={`flex items-center gap-2 px-4 py-1 shrink-0 border-t ${cfg.bar}`}
      style={{ background: 'rgba(13,17,23,0.95)' }}>
      <span key={key} className={`flex items-center gap-1.5 text-2xs animate-status-in ${cfg.color}`}>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot}`} />
        <span className="font-mono">{cfg.icon}</span>
        <span>{statusMessage || 'Ready'}</span>
      </span>
    </div>
  )
}
