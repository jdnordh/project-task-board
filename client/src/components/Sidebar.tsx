/**
 * Sidebar — logo, WORKSPACE links (one per visible page) and a Collapse
 * button. 224px wide, 64px collapsed to icons.
 */

import type { MouseEvent } from 'react'
import { Icon } from './Icon'
import { PAGES } from '../lib'
import { capStyle } from './ui'

interface Props {
  page: string
  hidden: string[]
  collapsed: boolean
  onToggle: () => void
  counts: Record<string, number>
}

function LogoMark() {
  return (
    <div style={{
      width: 32, height: 32, borderRadius: 10, background: 'var(--grad-canopy)', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: 'var(--glow-accent)',
    }}>
      <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#06150c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        <path d="M2 21c0-3 1.85-5.36 5.08-6" />
      </svg>
    </div>
  )
}

export function Sidebar({ page, hidden, collapsed, onToggle, counts }: Props) {
  const pages = PAGES.filter((p) => !hidden.includes(p.id))
  const onLink = (e: MouseEvent<HTMLAnchorElement>, id: string) => {
    // Modifier and middle clicks fall through to the browser.
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
    e.preventDefault()
    location.hash = `#/${id}`
  }

  return (
    <nav style={{
      width: collapsed ? 64 : 224, flexShrink: 0, display: 'flex', flexDirection: 'column',
      background: 'rgba(11,18,14,0.72)', backdropFilter: 'var(--blur-md)', borderRight: '1px solid var(--border)',
      transition: 'width var(--dur-base) var(--ease-grow)', overflow: 'hidden', zIndex: 3,
    }}>
      <div style={{ height: 60, display: 'flex', alignItems: 'center', gap: 11, padding: '0 16px', flexShrink: 0 }}>
        <LogoMark />
        {!collapsed && (
          <span style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 17, color: 'var(--fg-1)', letterSpacing: '-0.02em' }}>
            Grove
          </span>
        )}
      </div>

      <div style={{ padding: '14px 12px', display: 'flex', flexDirection: 'column', gap: 3, flex: 1 }}>
        {!collapsed && <div style={{ ...capStyle, padding: '4px 10px 8px' }}>Workspace</div>}
        {pages.map((p) => {
          const active = p.id === page
          const count = counts[p.id]
          return (
            <a key={p.id} href={`#/${p.id}`} onClick={(e) => onLink(e, p.id)} title={collapsed ? p.label : undefined}
              className={active ? undefined : 'g-nav-link'}
              style={{
                display: 'flex', alignItems: 'center', gap: 12, padding: collapsed ? '10px 0' : '9px 10px',
                justifyContent: collapsed ? 'center' : 'flex-start', borderRadius: 10, position: 'relative',
                color: active ? 'var(--fg-1)' : 'var(--fg-3)', fontWeight: 600, fontSize: 14,
                background: active ? 'var(--accent-tint)' : 'transparent',
                boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
                transition: 'background var(--dur-fast), color var(--dur-fast)',
              }}>
              <Icon name={p.icon} size={18} color={active ? 'var(--accent)' : undefined} />
              {!collapsed && <span style={{ flex: 1 }}>{p.label}</span>}
              {!collapsed && count !== undefined && (
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '0 7px', borderRadius: 999, lineHeight: '18px',
                  background: active ? 'var(--accent-soft-2)' : 'var(--bg-2)', color: active ? 'var(--accent-fg)' : 'var(--fg-3)',
                }}>{count}</span>
              )}
            </a>
          )
        })}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
        <button type="button" onClick={onToggle} className="g-btn g-ghost" title={collapsed ? 'Expand' : 'Collapse'}
          style={{
            width: '100%', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'flex-start',
            padding: '8px 10px', borderRadius: 10, border: 'none', background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          }}>
          <Icon name="chevrons-left" size={17} style={{ transform: collapsed ? 'rotate(180deg)' : 'none', transition: 'transform var(--dur-base)' }} />
          {!collapsed && 'Collapse'}
        </button>
      </div>
    </nav>
  )
}
