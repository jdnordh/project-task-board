/**
 * ProjectPicker — single-select project picker with search. Completed
 * projects are hidden unless the task already uses one.
 */

import { useState } from 'react'
import type { Project } from '../types'
import { Icon } from './Icon'
import { usePopover } from './ui'
import { ProjectDot } from './skin'

export function ProjectPicker({ projects, value, onChange }: { projects: Project[]; value: string; onChange: (id: string) => void }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const ref = usePopover(open, () => setOpen(false))
  const current = projects.find((f) => f.id === value)
  const list = projects.filter((f) => (!f.completed || f.id === value) && f.name.toLowerCase().includes(q.trim().toLowerCase()))

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" className="g-input" onClick={() => { setQ(''); setOpen((o) => !o) }} aria-haspopup="listbox" aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', textAlign: 'left' }}>
        {current ? <ProjectDot project={current} size={9} /> : null}
        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{current?.name ?? 'Pick a project'}</span>
        <Icon name="chevron-down" size={14} color="var(--fg-3)" />
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 30, background: 'var(--bg-1)',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
        }}>
          <div style={{ padding: 8, borderBottom: '1px solid var(--border)' }}>
            <input autoFocus className="g-input" placeholder="Search projects…" value={q} onChange={(e) => setQ(e.target.value)}
              style={{ padding: '7px 10px', fontSize: 13 }}
              onKeyDown={(e) => { if (e.key === 'Enter' && list[0]) { e.preventDefault(); onChange(list[0].id); setOpen(false) } }} />
          </div>
          <div role="listbox" style={{ maxHeight: 240, overflowY: 'auto', padding: 4 }}>
            {list.length === 0 && <div style={{ padding: 10, fontSize: 13, color: 'var(--fg-3)' }}>No match</div>}
            {list.map((f) => (
              <button key={f.id} type="button" role="option" aria-selected={f.id === value} className="g-row-hover"
                onClick={() => { onChange(f.id); setOpen(false) }}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 9, padding: '8px 10px', border: 'none', borderRadius: 8,
                  background: f.id === value ? 'var(--accent-tint)' : 'transparent', color: 'var(--fg-1)', cursor: 'pointer', fontSize: 13.5, textAlign: 'left',
                }}>
                <ProjectDot project={f} size={8} />
                <span style={{ flex: 1 }}>{f.name}</span>
                {f.id === value && <Icon name="check" size={14} color="var(--accent)" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
