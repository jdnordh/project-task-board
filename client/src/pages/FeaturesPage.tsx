/**
 * FeaturesPage — active features (rename, colour/skin, Claude defaults,
 * complete, delete), an add form, and a collapsible Completed section.
 */

import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { Effort, Feature, ModelId, Task } from '../types'
import { CLAUDE_MODELS, CLAUDE_EFFORTS, FEATURE_PALETTE } from '../lib'
import { Icon } from '../components/Icon'
import { Button, Field, IconButton, PageHeader, SectionLabel, type ConfirmSpec } from '../components/ui'
import { FeatureDot, FeatureStripe } from '../components/skin'
import { ColorPicker, type Pick } from '../components/ColorPicker'
import { RepoPicker } from '../components/RepoPicker'
import { SkinSections } from '../extras/SkinSections'
import { playCompletion } from '../fx'

export interface FeaturesPageProps {
  features: Feature[]
  tasks: Task[]
  extras: boolean
  addSignal: number
  onCreate: (b: { name: string; color: string; skin: string | null }) => Promise<Feature>
  onUpdate: (id: string, patch: Partial<Feature>) => void
  onDelete: (id: string) => void
  onConfirm: (c: ConfirmSpec) => void
}

const card = {
  position: 'relative', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)',
  padding: '16px 18px 16px 22px', overflow: 'hidden',
} as const

function Picker({ value, onPick, extras }: { value: Pick; onPick: (p: Pick) => void; extras: boolean }) {
  return <ColorPicker value={value} onPick={onPick} extraSections={extras ? <SkinSections value={value} onPick={onPick} /> : null} />
}

function FeatureRow({ feature, tasks, extras, onUpdate, onComplete, onDelete, completedRow, onReactivate }: {
  feature: Feature; tasks: Task[]; extras: boolean; onUpdate: (patch: Partial<Feature>) => void
  onComplete?: (row: HTMLElement | null) => void; onDelete?: () => void; completedRow?: boolean; onReactivate?: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(feature.name)
  const rowRef = useRef<HTMLDivElement>(null)
  const done = tasks.filter((t) => t.status === 'done').length

  const commit = () => {
    setEditing(false)
    const n = name.trim()
    if (!n) setName(feature.name)
    else if (n !== feature.name) onUpdate({ name: n })
  }

  return (
    <div ref={rowRef} style={{ ...card, opacity: completedRow ? 0.7 : 1 }}>
      <FeatureStripe feature={feature} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 32 }}>
        <FeatureDot feature={feature} size={12} />
        {editing ? (
          <input autoFocus className="g-input" value={name} onChange={(e) => setName(e.target.value)} onBlur={commit}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); if (e.key === 'Escape') { setName(feature.name); setEditing(false) } }}
            style={{ flex: 1, padding: '5px 9px', fontSize: 15, fontWeight: 700 }} />
        ) : (
          <button type="button" onClick={() => !completedRow && setEditing(true)}
            style={{ flex: 1, textAlign: 'left', border: 'none', background: 'transparent', padding: 0, cursor: completedRow ? 'default' : 'text', fontSize: 15, fontWeight: 750, color: 'var(--fg-1)', fontFamily: 'var(--font-body)' }}>
            {feature.name}
          </button>
        )}
        <span style={{ fontSize: 12.5, color: 'var(--fg-3)', whiteSpace: 'nowrap' }}>{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
        {completedRow ? (
          <Button size="sm" variant="outline" icon="rotate-ccw" onClick={onReactivate}>Reactivate</Button>
        ) : (
          <>
            <IconButton icon="circle-check" label="Mark complete" onClick={() => onComplete?.(rowRef.current)} />
            <IconButton icon="pencil" label="Rename" onClick={() => setEditing(true)} />
            <IconButton icon="trash-2" label="Delete" onClick={onDelete} />
          </>
        )}
      </div>

      {tasks.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 6, background: 'var(--bg-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(done / tasks.length) * 100}%`, background: feature.color, transition: 'width var(--dur-base)' }} />
          </div>
          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--fg-3)' }}>{done}/{tasks.length} done</span>
        </div>
      )}

      {!completedRow && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, marginTop: 16 }}>
          <Field label="Board color">
            <Picker value={{ color: feature.color, skin: feature.skin }} extras={extras}
              onPick={(p) => onUpdate({ color: p.color, skin: p.skin })} />
          </Field>
          <Field label="Claude model & effort" hint="Shown when you drop a task in the Claude column. A task can change it.">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, maxWidth: 420 }}>
              <select className="g-input" value={feature.claude_model ?? ''} aria-label="Claude model"
                onChange={(e) => onUpdate({ claude_model: (e.target.value || null) as ModelId | null })}>
                <option value="">No model set</option>
                {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select className="g-input" value={feature.claude_effort ?? ''} aria-label="Claude effort"
                onChange={(e) => onUpdate({ claude_effort: (e.target.value || null) as Effort | null })}>
                <option value="">No effort set</option>
                {CLAUDE_EFFORTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Git repo" hint="Where Buddy's workers run for this feature's tasks. A task can change it.">
            <div style={{ maxWidth: 420 }}>
              <RepoPicker value={feature.repo_path} onChange={(repo_path) => onUpdate({ repo_path })} />
            </div>
          </Field>
        </div>
      )}
    </div>
  )
}

function AddForm({ features, extras, onCreate, onCancel }: { features: Feature[]; extras: boolean; onCreate: FeaturesPageProps['onCreate']; onCancel: () => void }) {
  const used = new Set(features.map((f) => f.color.toLowerCase()))
  const [name, setName] = useState('')
  const [pick, setPick] = useState<Pick>({ color: (FEATURE_PALETTE.find((p) => !used.has(p.hex.toLowerCase())) ?? FEATURE_PALETTE[0]).hex, skin: null })
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => { ref.current?.scrollIntoView({ block: 'center', behavior: 'smooth' }) }, [])
  const create = async () => {
    if (!name.trim()) return
    await onCreate({ name: name.trim(), color: pick.color, skin: pick.skin })
    onCancel()
  }
  return (
    <div ref={ref} style={{ ...card, border: '1px solid var(--accent-line)', boxShadow: 'var(--glow-accent)', padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Field label="Feature name">
        <input autoFocus className="g-input" value={name} placeholder="e.g. Search, Onboarding…" onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') create(); if (e.key === 'Escape') onCancel() }} />
      </Field>
      <Field label="Board color"><Picker value={pick} onPick={setPick} extras={extras} /></Field>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button onClick={onCancel}>Cancel</Button>
        <Button variant="primary" disabled={!name.trim()} onClick={create}>Create feature</Button>
      </div>
    </div>
  )
}

export function FeaturesPage({ features, tasks, extras, addSignal, onCreate, onUpdate, onDelete, onConfirm }: FeaturesPageProps) {
  const [adding, setAdding] = useState(false)
  const [showCompleted, setShowCompleted] = useState(false)
  const firstSignal = useRef(addSignal)
  useEffect(() => { if (addSignal !== firstSignal.current) setAdding(true) }, [addSignal])

  const active = features.filter((f) => !f.completed)
  const completed = features.filter((f) => f.completed)
  const tasksOf = (id: string) => tasks.filter((t) => t.feature === id)

  const complete = (f: Feature, row: HTMLElement | null) => {
    if (active.length <= 1) {
      onConfirm({ info: true, title: 'Keep at least one active feature', body: 'New tasks need an active parent feature. Reactivate or add another before completing this one.' })
      return
    }
    playCompletion(row, extras, () => onUpdate(f.id, { completed: true }))
  }
  const remove = (f: Feature) => {
    if (features.length <= 1) {
      onConfirm({ info: true, title: 'Keep at least one feature', body: 'Every task needs a parent feature. Add another feature before deleting this one.' })
      return
    }
    const n = tasksOf(f.id).length
    onConfirm({
      title: `Delete “${f.name}”?`, danger: true, confirm: 'Delete feature',
      body: n ? `This will also delete ${n} task${n === 1 ? '' : 's'} filed under it. This can't be undone.` : "This feature has no tasks. This can't be undone.",
      onConfirm: () => onDelete(f.id),
    })
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <PageHeader title="Features" subtitle="Every task belongs to a feature. Pick a color and the board uses it as a visual cue." />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {active.map((f) => (
          <FeatureRow key={f.id} feature={f} tasks={tasksOf(f.id)} extras={extras}
            onUpdate={(p) => onUpdate(f.id, p)} onComplete={(row) => complete(f, row)} onDelete={() => remove(f)} />
        ))}
        {adding ? (
          <AddForm features={features} extras={extras} onCreate={onCreate} onCancel={() => setAdding(false)} />
        ) : (
          <button type="button" onClick={() => setAdding(true)} className="g-btn g-ghost"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 14, borderRadius: 'var(--radius-md)',
              border: '1.5px dashed var(--border-strong)', background: 'transparent', color: 'var(--fg-2)', fontWeight: 650, fontSize: 14, cursor: 'pointer',
            }}>
            <Icon name="plus" size={16} />Add feature
          </button>
        )}
      </div>

      {completed.length > 0 && (
        <Collapsible open={showCompleted} onToggle={() => setShowCompleted((o) => !o)} label={`Completed (${completed.length})`}>
          {completed.map((f) => (
            <FeatureRow key={f.id} feature={f} tasks={tasksOf(f.id)} extras={extras} completedRow
              onUpdate={(p) => onUpdate(f.id, p)} onReactivate={() => onUpdate(f.id, { completed: false })} />
          ))}
        </Collapsible>
      )}
    </div>
  )
}

function Collapsible({ open, onToggle, label, children }: { open: boolean; onToggle: () => void; label: string; children: ReactNode }) {
  return (
    <div style={{ marginTop: 34 }}>
      <button type="button" onClick={onToggle} aria-expanded={open}
        style={{ display: 'flex', alignItems: 'center', gap: 8, border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', marginBottom: 14 }}>
        <Icon name="chevron-down" size={14} color="var(--fg-3)" style={{ transform: open ? 'none' : 'rotate(-90deg)', transition: 'transform var(--dur-fast)' }} />
        <SectionLabel>{label}</SectionLabel>
      </button>
      {open && <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>{children}</div>}
    </div>
  )
}
