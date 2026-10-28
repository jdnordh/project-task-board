/**
 * SettingsPage — profile name, board options, page visibility, Extras.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Settings } from '../types'
import { cleanDefaultEst, hideablePages, lockReason, parseHidden, turnOff, turnOn, isVisible, PAGES } from '../lib'
import { Icon } from '../components/Icon'
import { PageHeader, Stepper, Toggle } from '../components/ui'

interface Props {
  settings: Settings
  onSave: (patch: Record<string, string>) => void
}

function Section({ title, subtitle, children }: { title: string; subtitle: string; children: ReactNode }) {
  return (
    <section style={{ marginTop: 34 }}>
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>{title}</h2>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--fg-3)' }}>{subtitle}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  )
}

function Row({ icon, label, sub, control }: { icon: string; label: string; sub?: ReactNode; control: ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', background: 'var(--bg-1)',
      border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
    }}>
      <span style={{ width: 34, height: 34, borderRadius: 10, background: 'var(--bg-2)', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
        <Icon name={icon} size={17} color="var(--fg-2)" />
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 650, color: 'var(--fg-1)' }}>{label}</div>
        {sub && <div style={{ fontSize: 12.5, color: 'var(--fg-3)', marginTop: 2, lineHeight: 1.45 }}>{sub}</div>}
      </div>
      {control}
    </div>
  )
}

function NameInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value)
  const [saved, setSaved] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout>>()
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {saved && <span style={{ fontSize: 12.5, color: 'var(--success)' }}>Saved.</span>}
      <input className="g-input" value={v} maxLength={60} placeholder="e.g. Sam" aria-label="Your name" style={{ width: 220 }}
        onChange={(e) => setV(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
        onBlur={() => {
          const t = v.trim()
          setV(t)
          if (t === value) return
          onSave(t)
          setSaved(true)
          clearTimeout(timer.current)
          timer.current = setTimeout(() => setSaved(false), 1500)
        }} />
    </div>
  )
}

export function SettingsPage({ settings, onSave }: Props) {
  const extras = settings.extras === 'true'
  const hidden = parseHidden(settings.hidden_pages)
  const [also, setAlso] = useState<string[]>([])
  const name = settings.user_name ?? ''

  const setPage = (id: string, on: boolean) => {
    if (on) {
      const r = turnOn(hidden, id)
      setAlso(r.also)
      onSave({ hidden_pages: JSON.stringify(r.hidden) })
    } else {
      setAlso([])
      onSave({ hidden_pages: JSON.stringify(turnOff(hidden, id, extras)) })
    }
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="Settings" />

      <Section title="Profile" subtitle="Who you are. Claude Code reads this through the grove-agent MCP server.">
        <Row icon="user" label="Your name"
          sub={name.trim() ? 'Claude uses this name when it talks about you.' : 'Not set. Claude calls you “the user” until you add it.'}
          control={<NameInput value={name} onSave={(v) => onSave({ user_name: v })} />} />
      </Section>

      <Section title="Board" subtitle="How the board looks and how new tasks start. Hiding a column keeps its tasks.">
        <Row icon="octagon-x" label="Show Blocked column"
          sub="Off: blocked tasks stay blocked, and the board header shows how many there are."
          control={<Toggle on={settings.boardShowBlocked !== 'false'} label="Show Blocked column" onChange={(v) => onSave({ boardShowBlocked: String(v) })} />} />
        <Row icon="clock" label="Default time estimate"
          sub="New tasks start with this. A template's own estimate wins."
          control={<Stepper value={cleanDefaultEst(settings.default_est)} min={0.25} max={80} step="est" suffix="h" ariaLabel="default estimate"
            onChange={(v) => onSave({ default_est: String(v) })} />} />
      </Section>

      <Section title="Pages" subtitle="Choose which pages show in the sidebar. Hidden pages keep all their data. Turn a page back on to see it again.">
        {hideablePages(extras).map((p) => {
          const on = isVisible(p.id, hidden, extras)
          const lock = lockReason(p.id, hidden, extras)
          let sub: string | undefined
          if (lock?.kind === 'needed') sub = `Stays on: needed by ${PAGES.find((x) => x.id === lock.by)?.label}`
          else if (lock?.kind === 'last') sub = 'Stays on: at least one page must stay on'
          else if (on && also.length && p.id === 'board') sub = `Also turned on: ${also.map((a) => PAGES.find((x) => x.id === a)?.label).join(', ')}`
          return (
            <Row key={p.id} icon={p.icon} label={p.label} sub={sub}
              control={<Toggle on={on} disabled={!!lock} label={`Show ${p.label}`} onChange={(v) => setPage(p.id, v)} />} />
          )
        })}
      </Section>

      <Section title="Extras" subtitle="Fun extras, off by default. Turning them off hides them again and keeps everything you earned.">
        <Row icon="trophy" label="Enable Extras"
          sub={<>Animated feature skins, the Achievements page, and camos you unlock with achievement points.<br />Off: skinned features show their plain colour. Nothing is lost.</>}
          control={<Toggle on={extras} label="Enable Extras" onChange={(v) => onSave({ extras: String(v) })} />} />
      </Section>
    </div>
  )
}
