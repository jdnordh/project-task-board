/**
 * TopBar — sticky 60px bar: task search, the page's primary button and
 * the avatar. Grove is dark-only, so there is no theme toggle.
 */

import { Icon } from './Icon'
import { Button } from './ui'

interface Props {
  search: string
  onSearch: (v: string) => void
  page: string
  userName: string
  showNewTask: boolean
  onPrimary: () => void
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return ''
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}

export function TopBar({ search, onSearch, page, userName, showNewTask, onPrimary }: Props) {
  const isFeatures = page === 'features'
  const ini = initials(userName)
  return (
    <header style={{
      position: 'sticky', top: 0, zIndex: 20, height: 60, flexShrink: 0, display: 'flex', alignItems: 'center', gap: 14,
      padding: '0 28px', background: 'color-mix(in srgb, var(--bg-1) 72%, transparent)', backdropFilter: 'blur(12px)',
      borderBottom: '1px solid var(--border)',
    }}>
      <div style={{ position: 'relative', flex: '0 1 380px', minWidth: 140 }}>
        <Icon name="search" size={15} color="var(--fg-3)" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
        <input className="g-input" value={search} onChange={(e) => onSearch(e.target.value)} placeholder="Search tasks…"
          aria-label="Search tasks" style={{ paddingLeft: 36, height: 36, background: 'var(--bg-0)' }}
          onKeyDown={(e) => { if (e.key === 'Escape' && search) { e.stopPropagation(); onSearch('') } }} />
      </div>
      <div style={{ flex: 1 }} />
      {(isFeatures || showNewTask) && (
        <Button variant="primary" icon="plus" onClick={onPrimary}>{isFeatures ? 'Add feature' : 'New task'}</Button>
      )}
      <div title={userName || 'Set your name in Settings'} style={{
        width: 34, height: 34, borderRadius: '50%', flexShrink: 0, display: 'grid', placeItems: 'center',
        background: 'var(--bg-3)', border: '1px solid var(--border-strong)', color: 'var(--fg-1)',
        fontFamily: 'var(--font-display)', fontWeight: 800, fontSize: 12.5,
      }}>
        {ini || <Icon name="user" size={16} color="var(--fg-3)" />}
      </div>
    </header>
  )
}
