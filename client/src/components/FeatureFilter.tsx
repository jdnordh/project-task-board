/**
 * FeatureFilter — "Add filter" / "Edit filter" popover. It edits a draft;
 * only Apply commits it. Applied features show as chips with ×.
 */

import { useState } from 'react'
import type { Feature } from '../types'
import { Button, usePopover } from './ui'
import { Icon } from './Icon'
import { FeatureDot } from './skin'

interface Props {
  features: Feature[]
  counts: Map<string, number>
  value: string[]
  onChange: (v: string[]) => void
}

export function FeatureFilter({ features, counts, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<string[]>([])
  const [q, setQ] = useState('')
  const ref = usePopover(open, () => setOpen(false))

  const openPopover = () => {
    setDraft(value)
    setQ('')
    setOpen(true)
  }
  const shown = features.filter(
    (f) => (!f.completed || value.includes(f.id) || draft.includes(f.id)) && f.name.toLowerCase().includes(q.trim().toLowerCase()),
  )
  const toggle = (id: string) => setDraft((d) => (d.includes(id) ? d.filter((x) => x !== id) : [...d, id]))
  const applied = value.map((id) => features.find((f) => f.id === id)).filter(Boolean) as Feature[]

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
      <div ref={ref} style={{ position: 'relative' }}>
        <Button variant="outline" size="sm" icon="filter" onClick={() => (open ? setOpen(false) : openPopover())}>
          {value.length ? 'Edit filter' : 'Add filter'}
        </Button>
        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 30, width: 260, background: 'var(--bg-1)',
            border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-md)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          }}>
            <div style={{ padding: 10, borderBottom: '1px solid var(--border)' }}>
              <input autoFocus className="g-input" placeholder="Search features…" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: '7px 10px', fontSize: 13 }} />
            </div>
            <div style={{ maxHeight: 260, overflowY: 'auto', padding: 4 }}>
              {shown.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--fg-3)' }}>No features match</div>}
              {shown.map((f) => {
                const on = draft.includes(f.id)
                return (
                  <button key={f.id} type="button" onClick={() => toggle(f.id)} className="g-row-hover" role="checkbox" aria-checked={on}
                    style={{
                      width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: 'none', borderRadius: 8,
                      background: 'transparent', color: 'var(--fg-1)', cursor: 'pointer', fontSize: 13, textAlign: 'left',
                    }}>
                    <span style={{
                      width: 16, height: 16, borderRadius: 5, border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border-strong)'}`,
                      background: on ? 'var(--accent)' : 'transparent', display: 'grid', placeItems: 'center', flexShrink: 0,
                    }}>{on && <Icon name="check" size={11} color="var(--text-on-accent)" strokeWidth={3} />}</span>
                    <FeatureDot feature={f} size={8} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{counts.get(f.id) ?? 0}</span>
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', gap: 6, padding: 8, borderTop: '1px solid var(--border)' }}>
              <Button size="sm" onClick={() => setDraft([])}>Clear</Button>
              <div style={{ flex: 1 }} />
              <Button size="sm" onClick={() => setOpen(false)}>Cancel</Button>
              <Button size="sm" variant="primary" onClick={() => { onChange(draft); setOpen(false) }}>Apply</Button>
            </div>
          </div>
        )}
      </div>
      {applied.map((f) => (
        <span key={f.id} style={{
          display: 'inline-flex', alignItems: 'center', gap: 7, padding: '4px 6px 4px 10px', borderRadius: 999,
          border: '1px solid var(--border)', background: 'var(--bg-1)', fontSize: 12.5, color: 'var(--fg-1)',
        }}>
          <FeatureDot feature={f} size={7} />
          {f.name}
          <button type="button" aria-label={`Remove ${f.name} filter`} onClick={() => onChange(value.filter((x) => x !== f.id))}
            className="g-btn g-icon-btn" style={{ border: 'none', background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer', display: 'grid', placeItems: 'center', borderRadius: 999, width: 18, height: 18, padding: 0 }}>
            <Icon name="x" size={12} />
          </button>
        </span>
      ))}
      {applied.length > 1 && <Button size="sm" onClick={() => onChange([])}>Clear all</Button>}
    </div>
  )
}
