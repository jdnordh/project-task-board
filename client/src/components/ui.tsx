/**
 * ui.tsx — small shared building blocks: buttons, fields, stepper, toggle,
 * modal/confirm, priority badge, popover behaviour.
 */

import { useEffect, useRef, type CSSProperties, type ReactNode, type ButtonHTMLAttributes } from 'react'
import { createPortal } from 'react-dom'
import { Icon } from './Icon'
import { clampStep, estStep } from '../lib'

// ---- Buttons ---------------------------------------------------------------

type Variant = 'primary' | 'ghost' | 'danger' | 'outline'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  icon?: string
  size?: 'sm' | 'md'
}

export function Button({ variant = 'ghost', icon, size = 'md', children, style, className = '', ...rest }: ButtonProps) {
  const sm = size === 'sm'
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 7, whiteSpace: 'nowrap',
    padding: sm ? '6px 11px' : '9px 15px', borderRadius: sm ? 9 : 11,
    fontSize: sm ? 12.5 : 13.5, fontWeight: 650, cursor: 'pointer', border: '1px solid transparent',
  }
  const looks: Record<Variant, CSSProperties> = {
    primary: { background: 'var(--grad-canopy)', color: 'var(--text-on-accent)', boxShadow: 'var(--glow-accent)', fontWeight: 700 },
    ghost: { background: 'transparent', color: 'var(--fg-2)' },
    outline: { background: 'transparent', color: 'var(--fg-2)', borderColor: 'var(--border)' },
    danger: { background: 'transparent', color: 'var(--danger)' },
  }
  const cls = { primary: 'g-primary', ghost: 'g-ghost', outline: 'g-ghost', danger: 'g-ghost-danger' }[variant]
  return (
    <button type="button" className={`g-btn ${cls} ${className}`} style={{ ...base, ...looks[variant], ...style }} {...rest}>
      {icon && <Icon name={icon} size={sm ? 14 : 15} />}
      {children}
    </button>
  )
}

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: string
  size?: number
  label: string
}

export function IconButton({ icon, size = 30, label, style, ...rest }: IconButtonProps) {
  return (
    <button type="button" title={label} aria-label={label} className="g-btn g-icon-btn"
      style={{
        width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer', flexShrink: 0, ...style,
      }}
      {...rest}>
      <Icon name={icon} size={Math.round(size * 0.52)} />
    </button>
  )
}

// ---- Field, labels -----------------------------------------------------------

export const capStyle: CSSProperties = {
  fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase',
  color: 'var(--fg-3)', fontWeight: 600,
}

/** `group` renders a div, for content with no single input (e.g. the notes
 * editor): a label forwards clicks on its text to its first button. */
export function Field({ label, hint, children, style, right, group }: { label: string; hint?: ReactNode; children: ReactNode; style?: CSSProperties; right?: ReactNode; group?: boolean }) {
  const Tag = group ? 'div' : 'label'
  return (
    <Tag style={{ display: 'flex', flexDirection: 'column', gap: 7, minWidth: 0, ...style }} onClick={(e) => {
      // Let inner buttons work without the label re-focusing the first input.
      if (!group && (e.target as HTMLElement).closest('button')) e.preventDefault()
    }}>
      <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={capStyle}>{label}</span>
        {right}
      </span>
      {children}
      {hint && <span style={{ fontSize: 12, color: 'var(--fg-3)', lineHeight: 1.4 }}>{hint}</span>}
    </Tag>
  )
}

// ---- Stepper -----------------------------------------------------------------

interface StepperProps {
  value: number
  onChange: (v: number) => void
  min: number
  max: number
  step?: number | 'est'
  suffix?: string
  ariaLabel?: string
}

export function Stepper({ value, onChange, min, max, step = 1, suffix, ariaLabel }: StepperProps) {
  const stepFor = (dir: number) => (step === 'est' ? estStep(value, dir) : step)
  const bump = (dir: number) => onChange(clampStep(value + dir * stepFor(dir), min, max))
  const btn: CSSProperties = {
    width: 34, height: 36, border: 'none', background: 'transparent', color: 'var(--fg-2)', cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-0)', width: 'fit-content' }}>
      <button type="button" className="g-btn g-icon-btn" style={btn} onClick={() => bump(-1)} disabled={value <= min} aria-label={`Decrease ${ariaLabel ?? ''}`}>
        <Icon name="minus" size={14} />
      </button>
      <span style={{ minWidth: 54, textAlign: 'center', fontFamily: 'var(--font-mono)', fontSize: 13.5, color: 'var(--fg-1)', fontWeight: 600 }} aria-label={ariaLabel}>
        {value}{suffix}
      </span>
      <button type="button" className="g-btn g-icon-btn" style={btn} onClick={() => bump(1)} disabled={value >= max} aria-label={`Increase ${ariaLabel ?? ''}`}>
        <Icon name="plus" size={14} />
      </button>
    </div>
  )
}

// ---- Toggle ------------------------------------------------------------------

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={label} disabled={disabled}
      onClick={() => onChange(!on)}
      style={{
        width: 38, height: 22, borderRadius: 999, border: 'none', padding: 2, cursor: disabled ? 'not-allowed' : 'pointer',
        background: on ? 'var(--accent)' : 'var(--bg-3)', opacity: disabled ? 0.45 : 1, flexShrink: 0,
        transition: 'background var(--dur-fast) var(--ease-soft)',
      }}>
      <span style={{
        display: 'block', width: 18, height: 18, borderRadius: '50%', background: on ? 'var(--text-on-accent)' : 'var(--fg-3)',
        transform: `translateX(${on ? 16 : 0}px)`, transition: 'transform var(--dur-fast) var(--ease-grow)',
      }} />
    </button>
  )
}

// ---- Priority badge ------------------------------------------------------------

export function PriorityBadge({ n }: { n: number }) {
  const tone = n === 1 ? 'var(--danger)' : n === 2 ? 'var(--warning)' : n === 3 ? 'var(--accent-fg)' : 'var(--fg-2)'
  return (
    <span style={{
      fontFamily: 'var(--font-mono)', fontWeight: 600, fontSize: 10.5, padding: '1px 6px', borderRadius: 6, lineHeight: '16px',
      color: tone, background: n >= 4 ? 'var(--bg-3)' : 'transparent',
      border: `1px solid color-mix(in srgb, ${tone} 35%, transparent)`, flexShrink: 0,
    }}>P{n}</span>
  )
}

// ---- Popover behaviour -----------------------------------------------------------

/** Close on outside click and on Escape (which must not reach the drawer). */
export function usePopover(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => {
    if (!open) return
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) close.current()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        e.preventDefault()
        close.current()
      }
    }
    document.addEventListener('mousedown', down)
    window.addEventListener('keydown', key, true)
    return () => {
      document.removeEventListener('mousedown', down)
      window.removeEventListener('keydown', key, true)
    }
  }, [open])
  return ref
}

// ---- Modal & confirm -----------------------------------------------------------

export function Modal({ children, onClose, z = 80, width = 420 }: { children: ReactNode; onClose: () => void; z?: number; width?: number }) {
  return createPortal(
    <div className="g-fade" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: z, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, animation: 'g-fade-in var(--dur-fast) both',
      }}>
      <div role="dialog" aria-modal="true" className="grove-overlay"
        style={{ width: `min(${width}px, 100%)`, background: 'var(--bg-1)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', padding: 22 }}>
        {children}
      </div>
    </div>,
    document.body,
  )
}

export interface ConfirmSpec {
  title: string
  body: string
  confirm?: string
  danger?: boolean
  /** Info-only dialog with a single OK button. */
  info?: boolean
  onConfirm?: () => void
}

export function ConfirmDialog({ spec, onClose }: { spec: ConfirmSpec; onClose: () => void }) {
  const okRef = useRef<HTMLButtonElement>(null)
  const close = useRef(onClose)
  close.current = onClose
  useEffect(() => { okRef.current?.focus() }, [])
  // Escape closes the confirm only, never the drawer or modal behind it.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close.current()
    }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [])
  return (
    <Modal onClose={onClose} z={90}>
      <h3 style={{ fontSize: 17, marginBottom: 8 }}>{spec.title}</h3>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--fg-2)', lineHeight: 1.5 }}>{spec.body}</p>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        {!spec.info && <Button variant="ghost" onClick={onClose}>Cancel</Button>}
        <button ref={okRef} type="button" className="g-btn g-primary"
          onClick={() => { onClose(); spec.onConfirm?.() }}
          style={{
            padding: '9px 15px', borderRadius: 11, fontSize: 13.5, fontWeight: 700, cursor: 'pointer', border: '1px solid transparent',
            background: spec.danger ? 'var(--danger)' : 'var(--grad-canopy)', color: 'var(--text-on-accent)',
          }}>
          {spec.info ? 'OK' : spec.confirm ?? 'Confirm'}
        </button>
      </div>
    </Modal>
  )
}

/** Section label used above lists ("COMPLETED (3)", "ACHIEVEMENTS"). */
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ ...capStyle, fontSize: 11, ...style }}>{children}</div>
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 18 }}>
      <div style={{ minWidth: 0 }}>
        <h1 style={{ fontSize: 26 }}>{title}</h1>
        {subtitle && <p style={{ margin: '6px 0 0', color: 'var(--fg-3)', fontSize: 13.5 }}>{subtitle}</p>}
      </div>
      {actions && <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>{actions}</div>}
    </div>
  )
}
