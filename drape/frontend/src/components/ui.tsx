import { useEffect, useId, useRef, type ReactNode } from 'react'
import { errorText } from '@/lib/api'
import { CloseIcon } from './icons'

export function PageHeader({ title, subtitle, actions, back }: { title: string; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <header className="mb-6 flex flex-col gap-4 md:mb-8 md:flex-row md:items-end md:justify-between">
      <div>
        {back}
        <h1 className="page-title">{title}</h1>
        {subtitle && <p className="mt-2 max-w-prose text-[15px] text-ink2">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </header>
  )
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card flex flex-col items-start gap-3 p-6 md:p-8">
      <h2 className="section-title">{title}</h2>
      {body && <div className="max-w-prose text-[15px] text-ink2">{body}</div>}
      {action}
    </div>
  )
}

export function ErrorNote({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  if (!error) return null
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-card border border-danger/40 bg-danger/5 px-4 py-3 text-[15px] text-danger">
      <span>{errorText(error)}</span>
      {onRetry && (
        <button type="button" className="btn-secondary btn-sm" onClick={onRetry}>
          Try again
        </button>
      )}
    </div>
  )
}

export function Loading({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="flex items-center gap-3 py-8 text-ink2">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden />
      <span>{label}</span>
    </div>
  )
}

export function Dialog({ open, title, onClose, children, footer, wide }: {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const titleId = useId()
  useEffect(() => {
    if (!open) return
    const prev = document.activeElement as HTMLElement | null
    const node = ref.current
    const focusables = () =>
      Array.from(node?.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])') ?? []).filter(
        (el) => !el.hasAttribute('disabled'),
      )
    const first = focusables()[1] ?? focusables()[0]
    first?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        onClose()
      }
      if (e.key === 'Tab') {
        const els = focusables()
        if (!els.length) return
        const a = els[0]
        const z = els[els.length - 1]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      prev?.focus()
    }
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 p-0 md:items-center md:p-6" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`max-h-[92vh] w-full overflow-y-auto rounded-t-card bg-bg p-5 shadow-xl md:rounded-card md:p-6 ${wide ? 'md:max-w-3xl' : 'md:max-w-md'}`}
      >
        <div className="mb-4 flex items-start justify-between gap-4">
          <h2 id={titleId} className="section-title">
            {title}
          </h2>
          <button type="button" className="btn-quiet -mr-2 -mt-2 px-2" onClick={onClose} aria-label="Close">
            <CloseIcon />
          </button>
        </div>
        <div>{children}</div>
        {footer && <div className="mt-6 flex flex-wrap justify-end gap-2">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel = 'Cancel', danger, busy, onConfirm, onCancel }: {
  open: boolean
  title: string
  body: ReactNode
  confirmLabel: string
  cancelLabel?: string
  danger?: boolean
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Dialog
      open={open}
      title={title}
      onClose={onCancel}
      footer={
        <>
          <button type="button" className="btn-secondary" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button type="button" className={danger ? 'btn bg-danger text-white hover:bg-danger/90' : 'btn-primary'} onClick={onConfirm} disabled={busy}>
            {confirmLabel}
          </button>
        </>
      }
    >
      <div className="text-[15px] text-ink2">{body}</div>
    </Dialog>
  )
}

export function ChipGroup<T extends string>({ label, options, value, onChange, className = '' }: {
  label: string
  options: readonly { id: T; label: string; count?: number }[]
  value: T
  onChange: (v: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={`scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:px-0 ${className}`}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={value === o.id}
          className={`chip shrink-0 ${value === o.id ? 'chip-active' : ''}`}
          onClick={() => onChange(o.id)}
        >
          {o.label}
          {o.count !== undefined && <span className="ml-1.5 opacity-75">{o.count}</span>}
        </button>
      ))}
    </div>
  )
}

export function Field({ label, hint, error, children, htmlFor }: { label: string; hint?: string; error?: string; children: ReactNode; htmlFor: string }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="label">
        {label}
      </label>
      {children}
      {hint && !error && <p className="hint">{hint}</p>}
      {error && (
        <p className="mt-1 text-[13px] text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}

export function Segmented<T extends string | number>({ label, options, value, onChange, name }: {
  label: string
  name: string
  options: readonly { id: T; label: string }[]
  value: T | undefined
  onChange: (v: T) => void
}) {
  return (
    <fieldset>
      <legend className="label">{label}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <label key={String(o.id)} className={`chip cursor-pointer ${value === o.id ? 'chip-active' : ''}`}>
            <input type="radio" className="sr-only" name={name} checked={value === o.id} onChange={() => onChange(o.id)} />
            {o.label}
          </label>
        ))}
      </div>
    </fieldset>
  )
}
