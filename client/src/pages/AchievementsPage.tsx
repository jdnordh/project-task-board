/**
 * AchievementsPage — stats, camo track, earned animated skins, and the
 * visible and secret achievement cards. `#/achievements/<target>` scrolls
 * a target into view and flashes it.
 */

import { useEffect } from 'react'
import { CAMOS, SKINS } from '../lib'
import type { AchievementsPayload, AchievementView } from '../extras/types'
import { Icon } from '../components/Icon'
import { PageHeader, SectionLabel, capStyle } from '../components/ui'
import { SkinBackdrop } from '../extras/skins'

const panel = { background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)' } as const

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div style={{ ...panel, padding: '16px 18px' }}>
      <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontWeight: 800, fontSize: 28, color: 'var(--fg-1)', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 6 }}>{label}</div>
    </div>
  )
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function AchievementCard({ a }: { a: AchievementView }) {
  const done = !!a.unlocked_at
  const clued = a.hidden && !done && !!a.clue
  const masked = a.hidden && !done && !a.clue
  const icon = done || !a.hidden ? 'trophy' : clued ? 'lightbulb' : 'lock'
  const title = done || !a.hidden ? a.name : clued ? 'Secret achievement · clue' : 'Secret achievement'
  const showBar = !done && (a.goal ?? 0) > 1 && (!a.hidden || clued)
  return (
    <div data-ach-target={`a-${a.id}`} style={{
      ...panel, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, outline: '2px solid transparent', outlineOffset: 2,
      ...(done ? { border: '1px solid var(--accent-line)', background: 'linear-gradient(150deg, var(--accent-tint), var(--bg-1) 70%)' } : {}),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', background: done ? 'var(--accent-tint)' : 'var(--bg-2)', flexShrink: 0 }}>
          <Icon name={icon} size={17} color={done ? 'var(--accent)' : clued ? 'var(--warning)' : 'var(--fg-3)'} fill={done ? 'var(--accent-soft-2)' : undefined} />
        </span>
        <span style={{ flex: 1, fontWeight: 700, fontSize: 14, color: masked ? 'var(--fg-2)' : 'var(--fg-1)' }}>{title}</span>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: done ? 'var(--accent-fg)' : 'var(--fg-3)', fontWeight: 600 }}>{a.points} pts</span>
      </div>
      <div style={{ fontSize: 13, color: 'var(--fg-2)', lineHeight: 1.5 }}>
        {masked ? 'Keep working. This one shows itself when you earn it.' : clued ? <em>“{a.clue}”</em> : a.desc}
      </div>
      {showBar && a.goal && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, height: 4, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${((a.progress ?? 0) / a.goal) * 100}%`, background: 'var(--accent)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--fg-3)' }}>{a.progress ?? 0} / {a.goal}</span>
        </div>
      )}
      {done && <div style={{ fontSize: 12, color: 'var(--accent-fg)' }}>Unlocked {fmtDate(a.unlocked_at!)}</div>}
    </div>
  )
}

export function AchievementsPage({ data, target }: { data: AchievementsPayload | null; target?: string }) {
  useEffect(() => {
    if (!target || !data) return
    const el = document.querySelector<HTMLElement>(`[data-ach-target="${CSS.escape(target)}"]`)
    if (!el) return
    el.scrollIntoView({ block: 'center', behavior: 'smooth' })
    el.style.transition = 'outline-color 200ms'
    el.style.outlineColor = 'var(--accent)'
    const id = setTimeout(() => { el.style.outlineColor = 'transparent' }, 2600)
    history.replaceState(null, '', '#/achievements')
    return () => clearTimeout(id)
  }, [target, data])

  if (!data) return <div style={{ color: 'var(--fg-3)' }}>Loading…</div>

  const visible = data.achievements.filter((a) => !a.hidden)
  const secret = data.achievements.filter((a) => a.hidden)
  const earned = new Set(data.achievements.filter((a) => a.unlocked_at).map((a) => a.id))
  const open = new Set(data.camos)
  const next = CAMOS.find((c) => !open.has(c.id))
  const skins = SKINS.filter((s) => earned.has(s.secret))

  return (
    <div style={{ maxWidth: 1000 }}>
      <PageHeader title="Achievements"
        subtitle="Earned by real work: tasks finished through In Progress, deadlines kept, estimates you hit. Points unlock camos for your features." />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        <Stat value={data.points} label={`of ${data.total_points} pts`} />
        <Stat value={earned.size} label={`of ${data.achievements.length} earned`} />
        <Stat value={open.size} label={`of ${CAMOS.length} camos`} />
      </div>

      <section style={{ ...panel, padding: 18, marginTop: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ ...capStyle, flex: 1, fontSize: 11 }}>Camo · {open.size} of {CAMOS.length}</span>
          <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>{next ? `${next.unlockAt - data.points} pts to ${next.name}` : 'All camos unlocked'}</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(78px, 1fr))', gap: 12 }}>
          {CAMOS.map((c) => {
            const on = open.has(c.id)
            return (
              <div key={c.id} data-ach-target={`c-${c.id}`} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, textAlign: 'center', outline: '2px solid transparent', outlineOffset: 3, borderRadius: 10 }}>
                <div style={{
                  width: 44, height: 44, borderRadius: 10, position: 'relative', overflow: 'hidden', display: 'grid', placeItems: 'center',
                  backgroundImage: `var(--grove-tex-camo-${c.id})`, backgroundSize: '64px', boxShadow: 'inset 0 0 0 1px rgba(255,255,255,.12)',
                  filter: on ? 'none' : 'grayscale(1) brightness(.4)',
                }}>
                  {!on && <Icon name="lock" size={14} color="#fff" />}
                </div>
                <div style={{ fontSize: 12, fontWeight: 650, color: on ? 'var(--fg-1)' : 'var(--fg-3)' }}>{c.name}</div>
                <div style={{ fontSize: 11, fontFamily: 'var(--font-mono)', color: 'var(--fg-3)' }}>{c.unlockAt} pts</div>
              </div>
            )
          })}
        </div>
      </section>

      <section style={{ ...panel, padding: 18, marginTop: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <span style={{ ...capStyle, flex: 1, fontSize: 11 }}>Animated · {skins.length} of {SKINS.length}</span>
          <span style={{ fontSize: 12.5, color: 'var(--fg-3)' }}>Secret achievements unlock these</span>
        </div>
        {skins.length === 0 ? (
          <div style={{ fontSize: 13, color: 'var(--fg-3)' }}>None yet. Each secret achievement you find unlocks one.</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
            {skins.map((s) => (
              <div key={s.id} data-ach-target={`s-${s.id}`} style={{ display: 'flex', alignItems: 'center', gap: 10, outline: '2px solid transparent', outlineOffset: 3, borderRadius: 10 }}>
                <div style={{ width: 44, height: 44, borderRadius: 10, position: 'relative', overflow: 'hidden', flexShrink: 0 }}>
                  <SkinBackdrop skin={{ kind: 'anim', def: s }} />
                </div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--fg-1)' }}>{s.name}</div>
                  <div style={{ fontSize: 11.5, color: 'var(--fg-3)' }}>{data.achievements.find((a) => a.id === s.secret)?.name}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <SectionLabel style={{ margin: '28px 0 12px' }}>Achievements</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {visible.map((a) => <AchievementCard key={a.id} a={a} />)}
      </div>

      <SectionLabel style={{ margin: '28px 0 12px' }}>Secret · {secret.filter((a) => a.unlocked_at).length} of {secret.length} found</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
        {secret.map((a) => <AchievementCard key={a.id} a={a} />)}
      </div>
    </div>
  )
}
