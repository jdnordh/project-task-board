/**
 * TaskDrawer — right-hand modal to create or edit a task. Edits a deep
 * copy (the draft); there is no autosave. Ctrl/Cmd+S saves, Escape closes
 * (asking first when dirty).
 */

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import type { AgentState, ColumnId, Draft, Effort, Feature, ModelId, Settings, Task, Template } from '../types'
import {
  COLUMNS, CLAUDE_MODELS, CLAUDE_EFFORTS, NOTE_MAX, columnLabel, localDate, endOfWeek, applyTemplate, fieldsFromTask, fmtAge, textToHtml,
} from '../lib'
import { Icon } from './Icon'
import { Button, ConfirmDialog, Field, IconButton, Stepper, capStyle, type ConfirmSpec } from './ui'
import { NotesEditor } from './NotesEditor'
import { FeaturePicker } from './FeaturePicker'
import { TemplatePicker } from './TemplatePicker'
import { AGENT_META } from './Card'
import type { TemplatesModalSpec } from './TemplatesModal'
import { SkinBackdrop, useSkin } from '../extras/skins'

export interface TaskDrawerProps {
  task: Task | Draft
  live?: Task
  features: Feature[]
  settings: Settings
  templates: Template[]
  templatesOpen: boolean
  onSave: (d: Draft) => Promise<void>
  onDelete: () => Promise<void>
  onClose: () => void
  onRemoveFile: (taskId: string, fileId: string) => void
  onUseTemplate: (id: string) => void
  onOpenTemplates: (spec: TemplatesModalSpec) => void
}

const DIRTY_KEYS = ['title', 'feature', 'priority', 'est', 'due', 'status', 'desc', 'desc_html', 'subtasks', 'agent_state', 'agent_note', 'claude_model', 'claude_effort'] as const

function snapshot(d: Partial<Draft>) {
  return JSON.stringify(DIRTY_KEYS.map((k) => (d as Record<string, unknown>)[k] ?? null))
}

function toDraft(t: Task | Draft): Draft {
  const copy = JSON.parse(JSON.stringify(t)) as Task & Draft
  return {
    id: copy.id, _new: copy._new, title: copy.title, feature: copy.feature, priority: copy.priority, est: copy.est, due: copy.due ?? null,
    status: copy.status, desc: copy.desc ?? '', desc_html: copy.desc_html ?? '', subtasks: copy.subtasks ?? [],
    agent_state: copy.agent_state ?? null, agent_note: copy.agent_note ?? '', claude_model: copy.claude_model ?? null, claude_effort: copy.claude_effort ?? null,
  }
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

export function TaskDrawer(props: TaskDrawerProps) {
  const { task, live, features, settings, templates, templatesOpen, onSave, onDelete, onClose, onRemoveFile, onUseTemplate, onOpenTemplates } = props
  const isNew = !task.id
  const original = useMemo(() => toDraft(task), [task])
  const [draft, setDraft] = useState<Draft>(original)
  const [subsTouched, setSubsTouched] = useState(false)
  const [editorKey, setEditorKey] = useState(0)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [newSub, setNewSub] = useState('')
  const [duePick, setDuePick] = useState<'today' | 'eow' | null>(null)
  const [saving, setSaving] = useState(false)

  const feature = features.find((f) => f.id === draft.feature)
  // Until the user touches subtasks, show the live list (Claude may tick them meanwhile).
  const subtasks = subsTouched ? draft.subtasks : live?.subtasks ?? draft.subtasks
  const dirty = snapshot({ ...draft, subtasks: subsTouched ? draft.subtasks : original.subtasks }) !== snapshot(original)

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => ({ ...d, [k]: v }))
  const editSubs = (fn: (s: Draft['subtasks']) => Draft['subtasks']) => {
    setDraft((d) => ({ ...d, subtasks: fn(subsTouched ? d.subtasks : JSON.parse(JSON.stringify(subtasks))) }))
    setSubsTouched(true)
  }

  const save = async () => {
    if (!draft.title.trim() || saving) return
    setSaving(true)
    try {
      await onSave({ ...draft, subtasks: subsTouched ? draft.subtasks : original.subtasks })
    } finally {
      setSaving(false)
    }
  }
  const attemptClose = () => {
    if (!dirty) return onClose()
    setConfirm({
      title: 'Discard changes?', body: 'You have unsaved edits to this task. Closing now will lose them.',
      confirm: 'Discard changes', danger: true, onConfirm: onClose,
    })
  }
  const askDelete = () => setConfirm({
    title: `Delete “${original.title}”?`, body: "The task and its subtasks are deleted. This can't be undone.",
    confirm: 'Delete task', danger: true, onConfirm: () => { onDelete() },
  })

  // Keys: off while the templates modal is open (it owns them then).
  const handlers = useRef({ save, attemptClose, confirmOpen: !!confirm })
  handlers.current = { save, attemptClose, confirmOpen: !!confirm }
  useEffect(() => {
    if (templatesOpen) return
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (e.repeat || handlers.current.confirmOpen) return
        handlers.current.save()
      } else if (e.key === 'Escape') {
        if (handlers.current.confirmOpen) setConfirm(null)
        else handlers.current.attemptClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [templatesOpen])

  const applyTpl = (t: Template) => {
    setDraft((d) => applyTemplate({ ...d, subtasks: subsTouched ? d.subtasks : subtasks }, t.fields, { featureIds: features.map((f) => f.id) }))
    if (t.fields.subtasks?.length) setSubsTouched(true)
    setEditorKey((k) => k + 1)
    if (t.fields.due) setDuePick(null)
    onUseTemplate(t.id)
  }

  const today = localDate()
  const eow = localDate(endOfWeek())
  const lit = duePick && (duePick === 'today' ? today : eow) === draft.due ? duePick
    : draft.due === today ? 'today' : draft.due === eow ? 'eow' : null

  const skin = useSkin(feature?.skin)
  const headerTint = skin ? 'transparent' : feature ? `linear-gradient(135deg, color-mix(in srgb, ${feature.color} 22%, var(--bg-1)), color-mix(in srgb, ${feature.color} 8%, var(--bg-1)))` : 'var(--bg-1)'
  const savedState = live?.agent_state ?? null
  const stateKey = draft.agent_state ?? 'waiting'
  const subsDone = subtasks.filter((s) => s.done).length
  const featureModel = feature?.claude_model ? CLAUDE_MODELS.find((m) => m.id === feature.claude_model)?.label : null
  const report = live?.agent_report ?? ''
  const files = live?.files ?? []

  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) attemptClose() }}
      style={{
        position: 'fixed', inset: 0, zIndex: 60, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)', padding: 12,
        display: 'flex', justifyContent: 'flex-end', animation: 'g-fade-in var(--dur-fast) both',
      }}>
      <div role="dialog" aria-modal="true" aria-label={isNew ? 'New task' : 'Edit task'} className="grove-drawer"
        style={{
          width: 'min(540px, 100%)', height: '100%', display: 'flex', flexDirection: 'column', background: 'var(--bg-1)',
          border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)', overflow: 'hidden',
          position: 'relative',
        }}>
        {/* A skinned feature fills the whole drawer; body and footer then sit on one glass panel. */}
        {skin && <SkinBackdrop skin={skin} />}
        <header style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 14px 20px', background: headerTint, borderBottom: skin ? 'none' : '1px solid var(--border)' }}>
          <span style={{ flex: 1 }}>
            <span style={{
              ...capStyle, fontSize: 11, color: skin ? 'var(--fg-1)' : 'var(--fg-2)',
              ...(skin ? { background: 'var(--skin-glass-bg)', border: '1px solid var(--skin-glass-border)', borderRadius: 7, padding: '4px 9px' } : {}),
            }}>{isNew ? 'New task' : 'Edit task'}</span>
          </span>
          <IconButton icon="x" label="Close" onClick={attemptClose}
            style={skin ? { background: 'var(--skin-glass-bg)', color: 'var(--fg-1)', border: '1px solid var(--skin-glass-border)' } : undefined} />
        </header>

        <div style={{
          position: 'relative', flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column',
          ...(skin ? { margin: '0 12px 12px', background: 'var(--skin-glass-bg)', border: '1px solid var(--skin-glass-border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' } : {}),
        }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {draft.status === 'claude' && (
            <ClaudeBand
              state={draft.agent_state ?? null} note={draft.agent_note ?? ''} age={(draft.agent_state ?? null) === savedState ? fmtAge(live?.agent_at ?? null) : ''}
              stateKey={stateKey} onState={(s) => set('agent_state', s)} onNote={(n) => set('agent_note', n)}
            />
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <input autoFocus className="g-input" value={draft.title} placeholder="What needs doing?" aria-label="Title"
              onChange={(e) => set('title', e.target.value)}
              style={{ fontSize: 18, fontWeight: 700, padding: '11px 13px', fontFamily: 'var(--font-body)' }} />
            {isNew && <TemplatePicker templates={templates} onApply={applyTpl} onManage={() => onOpenTemplates({})} />}
          </div>

          <Field label="Parent feature">
            <FeaturePicker features={features} value={draft.feature} onChange={(id) => set('feature', id)} />
          </Field>

          <Field label="Status">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {COLUMNS.map((c) => {
                const on = draft.status === c.id
                return (
                  <button key={c.id} type="button" onClick={() => set('status', c.id as ColumnId)} aria-pressed={on} className={on ? 'g-btn' : 'g-btn g-ghost'}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '8px 10px', borderRadius: 9, fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
                      border: `1px solid ${on ? 'transparent' : 'var(--border)'}`, background: on ? 'var(--accent)' : 'transparent',
                      color: on ? 'var(--text-on-accent)' : 'var(--fg-2)', minWidth: 0,
                    }}>
                    <Icon name={c.icon} size={14} />
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{columnLabel(c, settings.user_name)}</span>
                  </button>
                )
              })}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <Field label="Priority rank" hint="Lower = more important">
              <Stepper value={draft.priority} onChange={(v) => set('priority', v)} min={1} max={9} ariaLabel="priority" />
            </Field>
            <Field label="Time estimate">
              <Stepper value={draft.est} onChange={(v) => set('est', v)} min={0} max={80} step="est" suffix="h" ariaLabel="estimate" />
            </Field>
          </div>

          <Field label="Due date">
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <input type="date" className="g-input" value={draft.due ?? ''} aria-label="Due date"
                onChange={(e) => { set('due', e.target.value || null); setDuePick(null) }}
                style={{ width: 170, colorScheme: 'dark' }} />
              <QuickPick label="Today" on={lit === 'today'} onClick={() => { set('due', today); setDuePick('today') }} />
              <QuickPick label="EOW" on={lit === 'eow'} onClick={() => { set('due', eow); setDuePick('eow') }} />
              {draft.due && <Button size="sm" onClick={() => { set('due', null); setDuePick(null) }}>Clear</Button>}
            </div>
          </Field>

          <Field label="Notes">
            <NotesEditor key={editorKey} initialHtml={draft.desc_html || textToHtml(draft.desc)}
              onChange={(html, text) => setDraft((d) => ({ ...d, desc_html: html, desc: text }))} />
          </Field>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={capStyle}>Subtasks</span>
              {subtasks.length > 0 && (
                <span style={{ fontSize: 12, fontFamily: 'var(--font-mono)', color: subsDone === subtasks.length ? 'var(--success)' : 'var(--fg-3)' }}>
                  {subsDone}/{subtasks.length} done
                </span>
              )}
            </div>
            {subtasks.length > 0 && (
              <div style={{ height: 4, borderRadius: 4, background: 'var(--bg-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${(subsDone / subtasks.length) * 100}%`, background: 'var(--success)', transition: 'width var(--dur-base)' }} />
              </div>
            )}
            {subtasks.map((s, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button type="button" role="checkbox" aria-checked={s.done} aria-label={s.t}
                  onClick={() => editSubs((l) => l.map((x, j) => (j === i ? { ...x, done: !x.done } : x)))}
                  style={{
                    width: 18, height: 18, borderRadius: 5, flexShrink: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0,
                    border: `1.5px solid ${s.done ? 'var(--success)' : 'var(--border-strong)'}`, background: s.done ? 'var(--success)' : 'transparent',
                  }}>
                  {s.done && <Icon name="check" size={12} color="var(--text-on-accent)" strokeWidth={3} />}
                </button>
                <span style={{ flex: 1, fontSize: 14, color: s.done ? 'var(--fg-3)' : 'var(--fg-1)', textDecoration: s.done ? 'line-through' : 'none', overflowWrap: 'anywhere' }}>{s.t}</span>
                <IconButton icon="x" label="Remove subtask" size={24} onClick={() => editSubs((l) => l.filter((_, j) => j !== i))} />
              </div>
            ))}
            <div style={{ display: 'flex', gap: 6 }}>
              <input className="g-input" value={newSub} placeholder="Add a subtask…" onChange={(e) => setNewSub(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && newSub.trim()) { e.preventDefault(); editSubs((l) => [...l, { t: newSub.trim(), done: false }]); setNewSub('') }
                }} />
              <Button variant="outline" disabled={!newSub.trim()} onClick={() => { editSubs((l) => [...l, { t: newSub.trim(), done: false }]); setNewSub('') }}>Add</Button>
            </div>
          </div>

          <Field label="Claude model & effort" hint="Shown when you drop the card in the Claude column">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <select className="g-input" value={draft.claude_model ?? ''} aria-label="Claude model"
                onChange={(e) => set('claude_model', (e.target.value || null) as ModelId | null)}>
                <option value="">{featureModel ? `Feature: ${featureModel}` : 'No model set'}</option>
                {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
              </select>
              <select className="g-input" value={draft.claude_effort ?? ''} aria-label="Claude effort"
                onChange={(e) => set('claude_effort', (e.target.value || null) as Effort | null)}>
                <option value="">{feature?.claude_effort ? `Feature: ${feature.claude_effort}` : 'No effort set'}</option>
                {CLAUDE_EFFORTS.map((x) => <option key={x} value={x}>{x}</option>)}
              </select>
            </div>
          </Field>

          {!isNew && (report || files.length > 0) && (
            <ClaudeReport markdown={report} files={files} onRemove={(fid) => live && onRemoveFile(live.id, fid)} />
          )}
        </div>

        <footer style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '12px 16px', borderTop: '1px solid var(--border)', background: skin ? 'transparent' : 'var(--bg-1)' }}>
          {!isNew && <Button variant="danger" icon="trash-2" onClick={askDelete}>Delete</Button>}
          <Button icon="layout-template" onClick={() => onOpenTemplates({ prefill: { name: draft.title.trim(), fields: fieldsFromTask(draft) } })}>Save as template</Button>
          <span style={{ flex: 1 }} />
          <Button onClick={attemptClose}>Cancel</Button>
          <Button variant="primary" disabled={!draft.title.trim() || saving} onClick={save}>{isNew ? 'Create task' : 'Save changes'}</Button>
        </footer>
        </div>
      </div>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>,
    document.body,
  )
}

function QuickPick({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on} className={on ? 'g-btn' : 'g-btn g-ghost'}
      style={{
        padding: '7px 12px', borderRadius: 9, fontSize: 12.5, fontWeight: 650, cursor: 'pointer',
        border: `1px solid ${on ? 'var(--accent-line)' : 'var(--border)'}`, background: on ? 'var(--accent-tint)' : 'transparent',
        color: on ? 'var(--accent-fg)' : 'var(--fg-2)',
      }}>{label}</button>
  )
}

function ClaudeBand({ state, note, age, stateKey, onState, onNote }: {
  state: AgentState | null; note: string; age: string; stateKey: string
  onState: (s: AgentState | null) => void; onNote: (n: string) => void
}) {
  const m = AGENT_META[stateKey]
  const box: CSSProperties = {
    border: `1px solid color-mix(in srgb, ${m.color} 35%, transparent)`, background: m.tint, borderRadius: 'var(--radius-sm)',
    padding: 14, display: 'flex', flexDirection: 'column', gap: 10,
  }
  return (
    <div style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: m.color, fontWeight: 700, fontSize: 13.5 }}>
        <Icon name={m.icon} size={15} className={state === 'running' ? 'g-pulse' : undefined} />
        Claude · {m.label}
        <span style={{ flex: 1 }} />
        {age && <span style={{ fontWeight: 500, fontSize: 12, color: 'var(--fg-3)' }}>{age}</span>}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '200px 1fr', gap: 10 }}>
        <Field label="Claude status">
          <select className="g-input" value={state ?? ''} onChange={(e) => onState((e.target.value || null) as AgentState | null)}>
            <option value="">Waiting to start</option>
            <option value="running">Running</option>
            <option value="question">Pending question</option>
            <option value="review">Design review</option>
            <option value="complete">Complete</option>
          </select>
        </Field>
        <Field label="Status note">
          <textarea className="g-input" rows={2} maxLength={NOTE_MAX} value={note} onChange={(e) => onNote(e.target.value)} style={{ resize: 'vertical' }} />
        </Field>
      </div>
    </div>
  )
}

function ClaudeReport({ markdown, files, onRemove }: { markdown: string; files: Task['files']; onRemove: (fid: string) => void }) {
  const html = useMemo(() => (markdown ? DOMPurify.sanitize(marked.parse(markdown, { async: false }) as string) : ''), [markdown])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelectorAll('a').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer' })
  }, [html])
  return (
    <Section label="Claude report">
      {html && <div ref={ref} className="g-md" dangerouslySetInnerHTML={{ __html: html }} />}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: html ? 10 : 0 }}>
          {files.map((f) => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Icon name="file-text" size={14} color="var(--link)" />
              <a href={f.url} target="_blank" rel="noopener noreferrer" title={f.path} style={{ flex: 1, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.title}</a>
              <IconButton icon="x" size={24} label="Remove link (the file stays on disk)" onClick={() => onRemove(f.id)} />
            </div>
          ))}
        </div>
      )}
    </Section>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 14, background: 'var(--bg-0)' }}>
      <div style={{ ...capStyle, marginBottom: 10 }}>{label}</div>
      {children}
    </div>
  )
}
