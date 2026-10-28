/**
 * UnlockToasts — the bottom-centre pill that plays unlocks one at a time.
 * Timing uses timers only (never animationend/transitionend), so the
 * queue keeps moving under reduced motion.
 */

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { CAMOS, SKINS } from '../lib'
import { Icon } from '../components/Icon'
import { SkinBackdrop } from './skins'
import type { Hint, QueueEntry } from './types'

export type ToastItem =
  | { key: string; type: 'ach'; id: string; name: string; points: number; hidden: boolean }
  | { key: string; type: 'skin'; id: string; name: string }
  | { key: string; type: 'camo'; id: string; name: string }
  | { key: string; type: 'hint'; id: string; clue: string; progress: number; goal: number }

/** Each unlock → the achievement, then its skin, then the camos it crossed; then the daily hint. */
export function expandQueue(queue: QueueEntry[], hint: Hint | null | undefined): ToastItem[] {
  const out: ToastItem[] = []
  for (const q of queue) {
    out.push({ key: `a-${q.id}`, type: 'ach', id: q.id, name: q.name, points: q.points, hidden: q.hidden })
    for (const s of SKINS.filter((x) => x.secret === q.id)) out.push({ key: `s-${s.id}`, type: 'skin', id: s.id, name: s.name })
    for (const c of q.camos) out.push({ key: `c-${c}`, type: 'camo', id: c, name: CAMOS.find((x) => x.id === c)?.name ?? c })
  }
  if (hint) out.push({ key: `h-${hint.id}-${hint.day}`, type: 'hint', id: hint.id, clue: hint.clue, progress: hint.progress, goal: hint.goal })
  return out
}

const T = { pop: 320, open: 420, hold: 3600, hintExtra: 1800, close: 420, gap: 260 }
type Phase = 'pop' | 'open' | 'hold' | 'close' | 'gone'

const LABEL = {
  ach: (i: ToastItem) => (i.type === 'ach' && i.hidden ? 'Secret achievement unlocked' : 'Achievement unlocked'),
  camo: () => 'Camo unlocked',
  skin: () => 'Animated skin unlocked',
  hint: () => 'Secret achievement hint',
}

function Badge({ item }: { item: ToastItem }) {
  const box = { width: 52, height: 52, borderRadius: '50%', position: 'relative', overflow: 'hidden', flexShrink: 0, display: 'grid', placeItems: 'center' } as const
  if (item.type === 'camo') return <span style={{ ...box, backgroundImage: `var(--grove-tex-camo-${item.id})`, backgroundSize: '64px' }} />
  if (item.type === 'skin') {
    const def = SKINS.find((s) => s.id === item.id)
    return <span style={box}>{def && <SkinBackdrop skin={{ kind: 'anim', def }} />}</span>
  }
  if (item.type === 'hint') return <span style={{ ...box, background: 'var(--warning-tint)' }}><Icon name="lightbulb" size={24} color="var(--warning)" /></span>
  return (
    <span style={{ ...box, background: 'radial-gradient(circle at 35% 30%, var(--canopy-300), var(--canopy-600) 70%)' }}>
      <Icon name="trophy" size={24} color="var(--text-on-accent)" />
    </span>
  )
}

interface Props {
  queue: ToastItem[]
  canOpen: boolean
  onShow: (item: ToastItem) => void
  onDone: (key: string) => void
  onSkipAll: () => void
  onOpen: (target: string) => void
}

export function UnlockToasts({ queue, canOpen, onShow, onDone, onSkipAll, onOpen }: Props) {
  const item = queue[0]
  const [phase, setPhase] = useState<Phase>('gone')

  useEffect(() => {
    if (!item) return
    onShow(item)
    const hold = T.hold + (item.type === 'hint' ? T.hintExtra : 0)
    const steps: [Phase, number][] = [['pop', 0], ['open', T.pop], ['hold', T.pop + T.open], ['close', T.pop + T.open + hold], ['gone', T.pop + T.open + hold + T.close]]
    const ids = steps.map(([p, at]) => setTimeout(() => setPhase(p), at))
    ids.push(setTimeout(() => onDone(item.key), T.pop + T.open + hold + T.close + T.gap))
    return () => ids.forEach(clearTimeout)
    // Only restart when the item at the head changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item?.key])

  if (!item) return null
  const wide = phase === 'open' || phase === 'hold'
  const width = !wide ? 64 : item.type === 'hint' ? 'min(480px, calc(100vw - 32px))' : 380
  const target = item.type === 'hint' ? `a-${item.id}` : item.key
  const label = LABEL[item.type](item)

  return createPortal(
    <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', zIndex: 110, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <button type="button" disabled={!canOpen} onClick={() => { onDone(item.key); onOpen(target) }} aria-live="polite"
        style={{
          height: 64, width, borderRadius: 999, border: '1px solid var(--border-strong)', background: 'var(--bg-1)', boxShadow: 'var(--shadow-lg), var(--glow-accent)',
          display: 'flex', alignItems: 'center', gap: 12, padding: 6, overflow: 'hidden', cursor: canOpen ? 'pointer' : 'default', textAlign: 'left',
          transform: phase === 'gone' ? 'scale(0)' : 'scale(1)', opacity: phase === 'gone' ? 0 : 1,
          transition: `width ${T.open}ms var(--ease-grow), transform ${T.pop}ms var(--ease-spring), opacity ${T.pop}ms`,
        }}>
        <Badge item={item} />
        <span style={{ minWidth: 0, flex: 1, opacity: wide ? 1 : 0, transition: 'opacity 180ms', whiteSpace: 'nowrap' }}>
          <span style={{ display: 'block', fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--accent-fg)' }}>{label}</span>
          {item.type === 'hint' ? (
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 13.5, color: 'var(--fg-1)' }}>
              <em style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>“{item.clue}”</em>
              <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-3)', flexShrink: 0 }}>{item.progress} / {item.goal}</span>
            </span>
          ) : (
            <span style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 14.5, fontWeight: 700, color: 'var(--fg-1)' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
              {item.type === 'ach' && <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--accent-fg)', flexShrink: 0 }}>+{item.points} pts</span>}
            </span>
          )}
        </span>
      </button>
      {queue.length > 1 && (
        <button type="button" onClick={onSkipAll}
          style={{ border: 'none', background: 'var(--bg-2)', color: 'var(--fg-2)', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '4px 12px', cursor: 'pointer' }}>
          Skip all ({queue.length - 1})
        </button>
      )}
    </div>,
    document.body,
  )
}
