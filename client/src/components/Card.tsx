/**
 * Card — one board card: feature line, title, meta row, then (by column)
 * the agent badge, linked files and the Done delta.
 */

import type { CSSProperties, DragEvent } from 'react'
import type { Feature, Task } from '../types'
import { Icon } from './Icon'
import { PriorityBadge } from './ui'
import { FeatureDot, FeatureStripe } from './skin'
import { DENSITY, dueTone, fmtAge, fmtDue, fmtDuration, fmtHours } from '../lib'

export const AGENT_META: Record<string, { label: string; icon: string; color: string; tint: string }> = {
  waiting: { label: 'Waiting to start', icon: 'clock', color: 'var(--fg-3)', tint: 'var(--bg-2)' },
  running: { label: 'Running', icon: 'play', color: 'var(--info)', tint: 'var(--info-tint)' },
  question: { label: 'Pending question', icon: 'circle-help', color: 'var(--warning)', tint: 'var(--warning-tint)' },
  review: { label: 'Design review', icon: 'eye', color: 'var(--accent-fg)', tint: 'var(--accent-tint)' },
  complete: { label: 'Complete', icon: 'circle-check', color: 'var(--success)', tint: 'var(--success-tint)' },
}

function AgentBadge({ task, compact, onCopy }: { task: Task; compact: boolean; onCopy: () => void }) {
  const key = task.agent_state ?? 'waiting'
  const m = AGENT_META[key]
  const base: CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 9px', borderRadius: 8, fontSize: 11.5, fontWeight: 650,
    color: m.color, background: m.tint, border: `1px solid color-mix(in srgb, ${m.color} 28%, transparent)`, maxWidth: '100%',
  }
  const age = fmtAge(task.agent_at)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      {key === 'waiting' ? (
        <button type="button" className="g-waiting" title={task.agent_note || 'Copy the prompt again'}
          onClick={(e) => { e.stopPropagation(); onCopy() }} draggable={false}
          style={{ ...base, cursor: 'pointer', fontFamily: 'inherit' }}>
          <span className="g-waiting-clock" style={{ display: 'inline-flex' }}><Icon name="clock" size={12} /></span>
          <span className="g-waiting-copy" style={{ alignItems: 'center', gap: 6 }}>
            <Icon name="copy" size={12} />{!compact && 'Copy'}
          </span>
          <span className="g-waiting-clock">Waiting</span>
        </button>
      ) : (
        <span style={base} title={task.agent_note || m.label}>
          <Icon name={m.icon} size={12} className={key === 'running' ? 'g-pulse' : undefined} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}{age && ` · ${age}`}</span>
        </span>
      )}
      {task.agent_report && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, color: 'var(--accent-fg)', fontWeight: 600 }}>
          <Icon name="file-text" size={12} />Report ready
        </span>
      )}
    </div>
  )
}

function DoneDelta({ task }: { task: Task }) {
  if (!task.started_at || !task.completed_at) return null
  const actual = (new Date(task.completed_at).getTime() - new Date(task.started_at).getTime()) / 3600000
  const delta = task.est - actual
  let text = 'on est.'
  let color = 'var(--fg-3)'
  if (Math.abs(delta) >= 1 / 60) {
    text = delta > 0 ? `+${fmtDuration(delta)} saved` : `−${fmtDuration(delta)} over`
    color = delta > 0 ? 'var(--success)' : 'var(--danger)'
  }
  return <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color, fontWeight: 600 }}>{text}</div>
}

interface CardProps {
  task: Task
  feature: Feature | undefined
  compact: boolean
  dragging: boolean
  onOpen: () => void
  onCopy: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}

export function Card({ task, feature, compact, dragging, onOpen, onCopy, onDragStart, onDragEnd }: CardProps) {
  const d = DENSITY
  const color = feature?.color ?? 'var(--fg-3)'
  const subsDone = task.subtasks.filter((s) => s.done).length
  const allDone = task.subtasks.length > 0 && subsDone === task.subtasks.length
  const pad = compact ? 10 : d.pad
  const isDone = task.status === 'done'

  return (
    <div
      role="button" tabIndex={0} draggable className="g-card"
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen() }}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      style={{
        position: 'relative', padding: `${pad}px ${pad}px ${pad}px ${pad + 4}px`, borderRadius: 'var(--radius-sm)',
        border: '1px solid var(--border)', cursor: 'grab', opacity: dragging ? 0.4 : 1, overflow: 'hidden',
        background: `linear-gradient(160deg, color-mix(in srgb, ${color} 9%, var(--bg-1)), color-mix(in srgb, ${color} 4%, var(--bg-1)))`,
        display: 'flex', flexDirection: 'column', gap: compact ? 8 : 10, outline: 'none',
      }}>
      {feature && <FeatureStripe feature={feature} />}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
        {feature && <FeatureDot feature={feature} size={7} />}
        <span style={{ flex: 1, fontSize: d.meta, color: 'var(--fg-3)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {feature?.name ?? '—'}
        </span>
        <PriorityBadge n={task.priority} />
      </div>
      <div className="g-clamp" style={{
        WebkitLineClamp: d.titleLines, fontSize: compact ? 13.5 : d.title, color: 'var(--fg-1)', fontWeight: 650, lineHeight: 1.35,
        overflowWrap: 'anywhere', textDecoration: isDone ? 'none' : undefined,
      }}>
        {task.title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: d.meta, color: 'var(--fg-3)', fontFamily: 'var(--font-mono)', flexWrap: 'wrap' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><Icon name="timer" size={12} />{fmtHours(task.est)}</span>
        {(task.due || isDone) && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: isDone ? 'var(--success)' : dueTone(task.due) }}>
            <Icon name="calendar" size={12} />{isDone ? 'Complete' : fmtDue(task.due)}
          </span>
        )}
        <span style={{ flex: 1 }} />
        {task.subtasks.length > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: allDone ? 'var(--success)' : 'var(--fg-3)' }}>
            <Icon name="list-checks" size={12} />{subsDone}/{task.subtasks.length}
          </span>
        )}
      </div>
      {task.status === 'claude' && <AgentBadge task={task} compact={compact} onCopy={onCopy} />}
      {task.files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          {task.files.map((f) => (
            <a key={f.id} href={f.url} target="_blank" rel="noopener noreferrer" draggable={false} title={f.path}
              onClick={(e) => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--link)', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
              <Icon name="file-text" size={12} /><span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.title}</span>
            </a>
          ))}
        </div>
      )}
      {isDone && <DoneDelta task={task} />}
    </div>
  )
}
