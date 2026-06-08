import { useState, useRef, useEffect } from 'react'
import { api } from '../bridge/interop'
import { useAppStore } from '../store/appStore'
import { useKeyboard } from '../hooks/useKeyboard'

export function CompanySelect() {
  const { setScreen, setCompany, setStatus } = useAppStore()
  const [name, setName]         = useState('Demo Company')
  const [currency, setCurrency] = useState('₹')
  const [fyStart, setFyStart]   = useState('2024-04-01')
  const [fyEnd, setFyEnd]       = useState('2025-03-31')
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => { nameRef.current?.focus() }, [])

  const handleCreate = async () => {
    if (!name.trim()) { setError('Company name is required'); return }
    setError('')
    setLoading(true)
    setStatus('Creating company…')
    const res = await api.company.create({ name: name.trim(), currencySymbol: currency, fiscalYearStart: fyStart, fiscalYearEnd: fyEnd })
    if (res.ok) {
      setCompany(name.trim())
      setStatus(`Company "${name.trim()}" loaded`, 'success')
      setScreen('home')
    } else {
      setError(res.error ?? 'Failed to create company')
      setStatus(res.error ?? 'Failed', 'error')
    }
    setLoading(false)
  }

  useKeyboard((action) => {
    if (action === 'submit') handleCreate()
  })

  return (
    <div className="animate-scale-in w-full max-w-sm"
      style={{ filter: 'drop-shadow(0 32px 64px rgba(0,0,0,0.7))' }}>

      {/* Glass card */}
      <div className="rounded-2xl overflow-hidden border border-surface-600/40"
        style={{ background: 'rgba(17,24,39,0.92)', backdropFilter: 'blur(24px)' }}>

        {/* Hero band */}
        <div className="px-6 pt-8 pb-5 relative overflow-hidden"
          style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.08) 100%)' }}>
          {/* Decorative blobs */}
          <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full opacity-20"
            style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
          <div className="absolute top-4 right-8 w-10 h-10 rounded-full opacity-10"
            style={{ background: 'radial-gradient(circle, #818cf8, transparent)' }} />

          <div className="relative flex items-center gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold text-base shadow-glow"
              style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}>
              H
            </div>
            <div>
              <div className="text-sm font-bold text-ink tracking-tight">Hiravir</div>
              <div className="text-2xs text-ink-muted">Accounting Suite</div>
            </div>
          </div>

          <h1 className="relative text-base font-semibold text-ink mb-0.5">Create Company</h1>
          <p className="relative text-2xs text-ink-muted">Set up your books of accounts to get started</p>
        </div>

        {/* Form body */}
        <div className="px-6 py-5 space-y-3.5">

          <FormField label="Company Name" required>
            <input
              ref={nameRef}
              className="w-full bg-surface-800/80 border border-surface-600/60 rounded-md
                         px-3 py-2 text-xs text-ink placeholder-ink-muted
                         focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/20
                         transition-all duration-150"
              placeholder="e.g. Acme Enterprises"
              value={name}
              onChange={e => setName(e.target.value)}
            />
          </FormField>

          <FormField label="Currency Symbol">
            <input
              className="w-full bg-surface-800/80 border border-surface-600/60 rounded-md
                         px-3 py-2 text-xs text-ink font-mono
                         focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/20
                         transition-all duration-150"
              value={currency}
              onChange={e => setCurrency(e.target.value)}
            />
          </FormField>

          <div className="grid grid-cols-2 gap-2.5">
            <FormField label="FY Start">
              <input type="date"
                className="w-full bg-surface-800/80 border border-surface-600/60 rounded-md
                           px-2 py-2 text-xs text-ink
                           focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/20
                           transition-all duration-150"
                value={fyStart}
                onChange={e => setFyStart(e.target.value)}
              />
            </FormField>
            <FormField label="FY End">
              <input type="date"
                className="w-full bg-surface-800/80 border border-surface-600/60 rounded-md
                           px-2 py-2 text-xs text-ink
                           focus:outline-none focus:border-brand/60 focus:ring-1 focus:ring-brand/20
                           transition-all duration-150"
                value={fyEnd}
                onChange={e => setFyEnd(e.target.value)}
              />
            </FormField>
          </div>

          {error && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-md bg-danger/10 border border-danger/25 text-2xs text-danger-light animate-fade-in">
              <span>✕</span><span>{error}</span>
            </div>
          )}

          <button
            className="w-full py-2.5 rounded-md text-xs font-semibold text-white mt-1
                       transition-all duration-200 hover:brightness-110 hover:shadow-glow
                       active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            style={{ background: loading ? '#374151' : 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
            onClick={handleCreate}
            disabled={loading}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Creating…
              </span>
            ) : (
              'Create Company  ↵'
            )}
          </button>
        </div>

        <div className="px-6 pb-4 text-2xs text-ink-faint text-center">
          Stored in Documents\Hiravir\Companies\
        </div>
      </div>
    </div>
  )
}

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-2xs font-medium text-ink-muted">
        {label}{required && <span className="text-danger-light ml-0.5">*</span>}
      </label>
      {children}
    </div>
  )
}
