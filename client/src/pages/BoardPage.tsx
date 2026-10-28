/**
 * BoardPage — six columns in one CSS grid with a shared vertical scroll.
 * Native HTML5 drag and drop; order within a column comes from the sort.
 */

import { useEffect, useMemo, useRef, useState, type DragEvent } from 'react'
import type { ColumnId, Feature, Settings, Task } from '../types'
import { COLUMNS, columnLabel, fmtHours, sortColumn, boardTasks } from '../lib'
import { Icon } from '../components/Icon'
import { Button, PageHeader } from '../components/ui'
import { Card } from '../components/Card'
import { FeatureFilter } from '../components/FeatureFilter'

export interface BoardPageProps {
  tasks: Task[]
  features: Feature[]
  settings: Settings
  search: string
  onMove: (id: string, status: ColumnId) => void
  onOpen: (t: Task) => void
  onNew: (status: ColumnId) => void
  onCopyPrompt: (t: Task) => void
  onSaveSettings: (patch: Record<string, string>) => void
  onOpenTemplates: () => void
}

const COMPACT_COL = 170

function accentFor(id: string) {
  if (id === 'blocked') return 'var(--danger)'
  if (id === 'done') return 'var(--success)'
  if (id === 'progress' || id === 'claude') return 'var(--accent-fg)'
  return 'var(--fg-3)'
}

export function BoardPage({ tasks, features, settings, search, onMove, onOpen, onNew, onCopyPrompt, onSaveSettings, onOpenTemplates }: BoardPageProps) {
  const [filter, setFilter] = useState<string[]>([])
  const [dragId, setDragId] = useState<string | null>(null)
  const [overCol, setOverCol] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const [, setTick] = useState(0)
  const gridRef = useRef<HTMLDivElement>(null)

  const showBlocked = settings.boardShowBlocked !== 'false'
  const backlogCollapsed = settings.boardBacklogCollapsed === 'true'
  const columns = COLUMNS.filter((c) => c.id !== 'blocked' || showBlocked)
  const openCount = columns.length - (backlogCollapsed ? 1 : 0)

  // Ages on agent badges stay fresh.
  useEffect(() => {
    const id = setInterval(() => setTick((n) => n + 1), 30000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setCompact(entry.contentRect.width / openCount < COMPACT_COL))
    ro.observe(el)
    return () => ro.disconnect()
  }, [openCount])

  const featureById = useMemo(() => new Map(features.map((f) => [f.id, f])), [features])
  const now = new Date()
  const onBoard = boardTasks(tasks, { now })
  const visible = boardTasks(tasks, { search, featureFilter: filter, now })
  const filtered = !!search.trim() || filter.length > 0
  const blockedHidden = tasks.filter((t) => t.status === 'blocked').length
  const featureCounts = useMemo(() => {
    const m = new Map<string, number>()
    for (const t of onBoard) m.set(t.feature, (m.get(t.feature) ?? 0) + 1)
    return m
  }, [onBoard])

  const byCol = (id: string) => sortColumn(visible.filter((t) => t.status === id), id, now)

  const dragProps = (colId: ColumnId) => ({
    onDragOver: (e: DragEvent) => {
      if (!dragId) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'move'
      if (overCol !== colId) setOverCol(colId)
    },
    onDragLeave: (e: DragEvent) => {
      if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) setOverCol((c) => (c === colId ? null : c))
    },
    onDrop: (e: DragEvent) => {
      e.preventDefault()
      const id = e.dataTransfer.getData('text/plain') || dragId
      setOverCol(null)
      setDragId(null)
      if (id) onMove(id, colId)
    },
  })

  const gridTemplate = columns.map((c) => (c.id === 'backlog' && backlogCollapsed ? '40px' : 'minmax(0, 1fr)')).join(' ')

  return (
    <div>
      <PageHeader
        title="Board"
        subtitle={`${visible.length} of ${onBoard.length} tasks${filtered ? ' · filtered' : ''} · drag cards between columns`}
        actions={<>
          {!showBlocked && blockedHidden > 0 && (
            <Button variant="danger" size="sm" icon="octagon-x" onClick={() => onSaveSettings({ boardShowBlocked: 'true' })}>
              {blockedHidden} blocked
            </Button>
          )}
          <Button variant="outline" size="sm" icon="layout-template" onClick={onOpenTemplates}>Templates</Button>
        </>}
      />
      <FeatureFilter features={features} counts={featureCounts} value={filter} onChange={setFilter} />

      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: gridTemplate, gap: compact ? 8 : 14, alignItems: 'start' }}>
        {columns.map((col) => {
          const id = col.id as ColumnId
          const list = byCol(id)
          const over = overCol === id
          const accent = accentFor(id)
          const label = columnLabel(col, settings.user_name)
          const dropStyle = over ? { background: 'var(--accent-tint)', outline: '1.5px dashed var(--accent-line)', outlineOffset: -1 } : {}

          if (id === 'backlog' && backlogCollapsed) {
            return (
              <button key={id} type="button" {...dragProps(id)} title="Show Backlog"
                onClick={() => onSaveSettings({ boardBacklogCollapsed: 'false' })}
                style={{
                  position: 'sticky', top: 72, minHeight: 260, borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  background: 'var(--bg-1)', color: 'var(--fg-3)', cursor: 'pointer', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 10, padding: '12px 0', ...dropStyle,
                }}>
                <Icon name="chevrons-left" size={15} style={{ transform: 'rotate(180deg)' }} />
                <Icon name={col.icon} size={15} />
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, padding: '0 6px', borderRadius: 999, background: 'var(--bg-2)' }}>{list.length}</span>
                <span style={{ writingMode: 'vertical-rl', fontSize: 12.5, fontWeight: 650, letterSpacing: '0.04em' }}>{label}</span>
              </button>
            )
          }

          const hours = list.reduce((s, t) => s + (t.est || 0), 0)
          return (
            <section key={id} {...dragProps(id)} aria-label={label}
              style={{ minWidth: 0, borderRadius: 'var(--radius-md)', transition: 'background var(--dur-fast)', ...dropStyle }}>
              <header style={{
                position: 'sticky', top: 60, zIndex: 5, display: 'flex', alignItems: 'center', gap: 7, padding: '10px 4px',
                background: 'color-mix(in srgb, var(--bg-0) 88%, transparent)', backdropFilter: 'blur(8px)', minWidth: 0,
              }}>
                {!compact && <Icon name={col.icon} size={15} color={accent} />}
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--fg-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{label}</span>
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11, padding: '0 7px', borderRadius: 999, lineHeight: '18px',
                  color: accent, background: `color-mix(in srgb, ${accent} 14%, transparent)`, flexShrink: 0,
                }}>{list.length}</span>
                <span style={{ flex: 1 }} />
                {!compact && hours > 0 && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{fmtHours(hours)}</span>}
                {id === 'backlog' && (
                  <button type="button" title="Hide Backlog" aria-label="Hide Backlog" className="g-btn g-icon-btn"
                    onClick={() => onSaveSettings({ boardBacklogCollapsed: 'true' })}
                    style={{ border: 'none', background: 'transparent', color: 'var(--fg-3)', cursor: 'pointer', borderRadius: 6, width: 24, height: 24, display: 'grid', placeItems: 'center', flexShrink: 0 }}>
                    <Icon name="chevrons-left" size={14} />
                  </button>
                )}
              </header>
              <div style={{ display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10, padding: '4px 0' }}>
                {list.length === 0 && (
                  <div style={{
                    border: '1.5px dashed var(--border)', borderRadius: 'var(--radius-sm)', padding: '22px 8px', textAlign: 'center',
                    fontSize: 12.5, color: 'var(--fg-3)',
                  }}>{over ? 'Drop here' : 'No tasks'}</div>
                )}
                {list.map((t) => (
                  <Card key={t.id} task={t} feature={featureById.get(t.feature)} compact={compact} dragging={dragId === t.id}
                    onOpen={() => onOpen(t)} onCopy={() => onCopyPrompt(t)}
                    onDragStart={(e) => {
                      e.dataTransfer.effectAllowed = 'move'
                      e.dataTransfer.setData('text/plain', t.id)
                      setDragId(t.id)
                    }}
                    onDragEnd={() => { setDragId(null); setOverCol(null) }}
                  />
                ))}
                <button type="button" onClick={() => onNew(id)} className="g-btn g-ghost"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'center', padding: '8px', borderRadius: 'var(--radius-sm)',
                    border: 'none', background: 'transparent', color: 'var(--fg-3)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                  }}>
                  <Icon name="plus" size={14} />{!compact && 'Add task'}
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
