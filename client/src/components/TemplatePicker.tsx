/**
 * TemplatePicker — chips under a new task's title: up to three recent
 * templates, then "More ▾" with search and keyboard navigation.
 */

import { useState } from 'react'
import type { Template } from '../types'
import { recentTemplates } from '../lib'
import { Icon } from './Icon'
import { usePopover } from './ui'

interface Props {
  templates: Template[]
  onApply: (t: Template) => void
  onManage: () => void
}

const chip = {
  display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, fontSize: 12, fontWeight: 600,
  border: '1px solid var(--border)', background: 'var(--bg-1)', color: 'var(--fg-2)', cursor: 'pointer',
} as const

export function TemplatePicker({ templates, onApply, onManage }: Props) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const [hi, setHi] = useState(0)
  const ref = usePopover(open, () => setOpen(false))

  if (templates.length === 0) {
    return (
      <button type="button" onClick={onManage} className="g-btn g-ghost" style={{ ...chip, borderStyle: 'dashed', alignSelf: 'flex-start' }}>
        <Icon name="layout-template" size={13} />Make a template
      </button>
    )
  }

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const matches = [...templates]
    .sort((a, b) => a.name.localeCompare(b.name))
    .filter((t) => {
      const hay = `${t.name} ${t.fields.title ?? ''}`.toLowerCase()
      return terms.every((w) => hay.includes(w))
    })
  const apply = (t: Template) => { onApply(t); setOpen(false) }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <Icon name="layout-template" size={13} color="var(--fg-3)" />
      {recentTemplates(templates, 3).map((t) => (
        <button key={t.id} type="button" onClick={() => onApply(t)} className="g-btn g-ghost" style={chip}>{t.name}</button>
      ))}
      <div ref={ref} style={{ position: 'relative' }}>
        <button type="button" onClick={() => { setQ(''); setHi(0); setOpen((o) => !o) }} className="g-btn g-ghost" style={chip}>
          More <Icon name="chevron-down" size={12} />
        </button>
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 280, background: 'var(--bg-1)',
            border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}>
            <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
              <input autoFocus className="g-input" placeholder="Search templates…" value={q}
                onChange={(e) => { setQ(e.target.value); setHi(0) }}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(h + 1, matches.length - 1)) }
                  if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)) }
                  if (e.key === 'Enter') { e.preventDefault(); if (matches[hi]) apply(matches[hi]) }
                }}
                style={{ padding: '7px 10px', fontSize: 13 }} />
            </div>
            <div style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
              {matches.length === 0 && <div style={{ padding: 10, fontSize: 13, color: 'var(--fg-3)' }}>No match</div>}
              {matches.map((t, i) => (
                <button key={t.id} type="button" onClick={() => apply(t)} onMouseEnter={() => setHi(i)}
                  style={{
                    width: '100%', textAlign: 'left', padding: '8px 10px', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 13,
                    background: i === hi ? 'var(--bg-2)' : 'transparent', color: 'var(--fg-1)',
                  }}>
                  {t.name}
                  {t.fields.title && <span style={{ color: 'var(--fg-3)' }}> · {t.fields.title}</span>}
                </button>
              ))}
            </div>
            <button type="button" onClick={() => { setOpen(false); onManage() }} className="g-row-hover"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 7, padding: '9px 12px', border: 'none', borderTop: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-2)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
              <Icon name="settings" size={13} />Manage templates
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
