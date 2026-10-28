/**
 * TemplatesModal — list + editor for task templates. Each field is a
 * "part" with a switch; only parts that are on are sent. While open the
 * modal owns Ctrl/Cmd+S and Escape.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { ColumnId, DueRule, Effort, Feature, ModelId, Subtask, Template, TemplateFields } from '../types'
import { COLUMNS, CLAUDE_MODELS, CLAUDE_EFFORTS, templateSummary } from '../lib'
import { Icon } from './Icon'
import { Button, ConfirmDialog, IconButton, Stepper, Toggle, capStyle, type ConfirmSpec } from './ui'
import { NotesEditor } from './NotesEditor'
import { FeaturePicker } from './FeaturePicker'

export interface TemplatesModalSpec {
  prefill?: { name: string; fields: TemplateFields }
  selectId?: string
}

export interface TemplatesModalProps {
  spec: TemplatesModalSpec
  templates: Template[]
  features: Feature[]
  onCreate: (name: string, fields: TemplateFields) => Promise<Template>
  onUpdate: (id: string, name: string, fields: TemplateFields) => Promise<Template>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

type PartKey = 'title' | 'feature' | 'status' | 'priority' | 'est' | 'due' | 'desc_html' | 'subtasks' | 'claude_model' | 'claude_effort'
const PARTS: PartKey[] = ['title', 'feature', 'status', 'priority', 'est', 'due', 'desc_html', 'subtasks', 'claude_model', 'claude_effort']

interface Values {
  title: string
  feature: string
  status: ColumnId
  priority: number
  est: number
  due: DueRule
  dueDays: number
  desc_html: string
  subtasks: Subtask[]
  claude_model: ModelId
  claude_effort: Effort
}

interface Form {
  id: string | null
  name: string
  on: Record<PartKey, boolean>
  v: Values
  editorKey: number
}

const isMac = /Mac|iPhone|iPad/.test(navigator.platform)

function formFrom(id: string | null, name: string, f: TemplateFields, features: Feature[]): Form {
  const on = Object.fromEntries(PARTS.map((k) => [k, f[k] !== undefined])) as Record<PartKey, boolean>
  return {
    id, name, on, editorKey: Date.now(),
    v: {
      title: f.title ?? '', feature: f.feature ?? features.find((x) => !x.completed)?.id ?? '', status: f.status ?? 'backlog',
      priority: f.priority ?? 2, est: f.est ?? 1, due: f.due ?? { kind: 'eow' }, dueDays: f.due?.kind === 'days' ? f.due.n : 7,
      desc_html: f.desc_html ?? '', subtasks: f.subtasks ?? [], claude_model: f.claude_model ?? 'sonnet', claude_effort: f.claude_effort ?? 'high',
    },
  }
}

function fieldsOf(form: Form): TemplateFields {
  const f: TemplateFields = {}
  const { on, v } = form
  if (on.title && v.title.trim()) f.title = v.title.trim()
  if (on.feature && v.feature) f.feature = v.feature
  if (on.status) f.status = v.status
  if (on.priority) f.priority = v.priority
  if (on.est) f.est = v.est
  if (on.due) f.due = v.due.kind === 'days' ? { kind: 'days', n: v.dueDays } : v.due
  if (on.desc_html && v.desc_html) f.desc_html = v.desc_html
  if (on.subtasks && v.subtasks.length) f.subtasks = v.subtasks
  if (on.claude_model) f.claude_model = v.claude_model
  if (on.claude_effort) f.claude_effort = v.claude_effort
  return f
}

const sig = (form: Form | null) => (form ? JSON.stringify({ n: form.name.trim(), f: fieldsOf(form) }) : '')

export function TemplatesModal({ spec, templates, features, onCreate, onUpdate, onDelete, onClose }: TemplatesModalProps) {
  const initial = useMemo(() => {
    if (spec.prefill) return formFrom(null, spec.prefill.name, spec.prefill.fields, features)
    const t = templates.find((x) => x.id === spec.selectId) ?? [...templates].sort((a, b) => a.name.localeCompare(b.name))[0]
    return t ? formFrom(t.id, t.name, t.fields, features) : formFrom(null, '', {}, features)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const [form, setForm] = useState<Form>(initial)
  const [baseline, setBaseline] = useState(() => (spec.prefill ? '' : sig(initial)))
  const [q, setQ] = useState('')
  const [error, setError] = useState('')
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [busy, setBusy] = useState(false)
  const nameRef = useRef<HTMLInputElement>(null)

  const dirty = sig(form) !== baseline
  const setV = <K extends keyof Values>(k: K, val: Values[K]) => setForm((f) => ({ ...f, v: { ...f.v, [k]: val } }))
  const setOn = (k: PartKey, val: boolean) => setForm((f) => ({ ...f, on: { ...f.on, [k]: val } }))

  const guard = (fn: () => void) => {
    if (!dirty) return fn()
    setConfirm({ title: 'Discard changes?', body: 'You have unsaved edits to this template. Leaving now will lose them.', confirm: 'Discard changes', danger: true, onConfirm: fn })
  }
  const pick = (t: Template | null) => guard(() => {
    const next = t ? formFrom(t.id, t.name, t.fields, features) : formFrom(null, '', {}, features)
    setForm(next)
    setBaseline(t ? sig(next) : '')
    setError('')
    if (!t) setTimeout(() => nameRef.current?.focus(), 0)
  })

  const save = async () => {
    if (busy) return
    if (!form.name.trim()) {
      setError('Give the template a name.')
      nameRef.current?.focus()
      return
    }
    setBusy(true)
    setError('')
    try {
      const fields = fieldsOf(form)
      const t = form.id ? await onUpdate(form.id, form.name.trim(), fields) : await onCreate(form.name.trim(), fields)
      const next = { ...form, id: t.id, name: t.name }
      setForm(next)
      setBaseline(sig(next))
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const askDelete = () => form.id && setConfirm({
    title: `Delete “${form.name}”?`, body: 'The template is deleted. Tasks made from it stay as they are.', confirm: 'Delete template', danger: true,
    onConfirm: async () => {
      await onDelete(form.id!)
      const empty = formFrom(null, '', {}, features)
      setForm(empty)
      setBaseline('')
    },
  })
  const attemptClose = () => guard(onClose)

  const keys = useRef({ save, attemptClose, confirmOpen: false })
  keys.current = { save, attemptClose, confirmOpen: !!confirm }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = isMac ? e.metaKey : e.ctrlKey
      if (mod && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault()
        e.stopPropagation()
        if (!e.repeat && !keys.current.confirmOpen) keys.current.save()
      } else if (e.key === 'Escape') {
        e.stopPropagation()
        if (keys.current.confirmOpen) setConfirm(null)
        else keys.current.attemptClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const terms = q.toLowerCase().split(/\s+/).filter(Boolean)
  const list = [...templates].sort((a, b) => a.name.localeCompare(b.name))
    .filter((t) => terms.every((w) => `${t.name} ${t.fields.title ?? ''}`.toLowerCase().includes(w)))

  const part = (k: PartKey, label: string, body: ReactNode, hint?: string) => (
    <Part key={k} label={label} on={form.on[k]} onToggle={(v) => setOn(k, v)} hint={hint}>{body}</Part>
  )

  return createPortal(
    <div onMouseDown={(e) => { if (e.target === e.currentTarget) attemptClose() }}
      style={{ position: 'fixed', inset: 0, zIndex: 70, background: 'rgba(0,0,0,.6)', backdropFilter: 'blur(2px)', padding: 12, display: 'grid', placeItems: 'center' }}>
      <div role="dialog" aria-modal="true" aria-label="Task templates" className="grove-overlay"
        style={{
          width: 'min(920px, 100%)', height: 'min(760px, 100%)', display: 'flex', flexDirection: 'column', overflow: 'hidden',
          background: 'var(--bg-1)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-lg)', boxShadow: 'var(--shadow-lg)',
        }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 14px 20px', borderBottom: '1px solid var(--border)' }}>
          <Icon name="layout-template" size={16} color="var(--accent)" />
          <span style={{ fontWeight: 750, color: 'var(--fg-1)', fontSize: 15, flex: 1 }}>Task templates</span>
          <IconButton icon="x" label="Close" onClick={attemptClose} />
        </header>
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <aside style={{ width: 280, flexShrink: 0, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
              <Button variant="outline" icon="plus" onClick={() => pick(null)} style={{ justifyContent: 'center' }}>New template</Button>
              <input className="g-input" placeholder="Search templates…" value={q} onChange={(e) => setQ(e.target.value)} style={{ padding: '7px 10px', fontSize: 13 }} />
            </div>
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 8px 8px' }}>
              {list.length === 0 && <div style={{ padding: 12, fontSize: 13, color: 'var(--fg-3)' }}>{templates.length ? 'No match' : 'No templates yet'}</div>}
              {list.map((t) => {
                const active = t.id === form.id
                return (
                  <button key={t.id} type="button" onClick={() => !active && pick(t)} className={active ? undefined : 'g-row-hover'}
                    style={{
                      width: '100%', textAlign: 'left', padding: '9px 10px', borderRadius: 9, border: 'none', cursor: 'pointer', marginBottom: 2,
                      background: active ? 'var(--accent-tint)' : 'transparent', boxShadow: active ? 'inset 2px 0 0 var(--accent)' : 'none',
                    }}>
                    <div style={{ fontSize: 13.5, fontWeight: 650, color: 'var(--fg-1)' }}>{t.name}</div>
                    <div style={{ fontSize: 11.5, color: 'var(--fg-3)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {templateSummary(t.fields, features) || 'Empty template'}
                    </div>
                  </button>
                )
              })}
            </div>
          </aside>

          <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 12, minWidth: 0 }}>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
              <span style={capStyle}>Template name</span>
              <input ref={nameRef} className="g-input" value={form.name} maxLength={80} placeholder="For example: Bug fix"
                onChange={(e) => { setForm((f) => ({ ...f, name: e.target.value })); setError('') }} style={{ fontSize: 15, fontWeight: 650 }} />
            </label>
            {part('title', 'Task title', <input className="g-input" value={form.v.title} maxLength={200} onChange={(e) => setV('title', e.target.value)} placeholder="Title the task starts with" />)}
            {part('feature', 'Feature', <FeaturePicker features={features} value={form.v.feature} onChange={(id) => setV('feature', id)} />)}
            {part('status', 'Status', (
              <select className="g-input" value={form.v.status} onChange={(e) => setV('status', e.target.value as ColumnId)}>
                {COLUMNS.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {part('priority', 'Priority', <Stepper value={form.v.priority} onChange={(v) => setV('priority', v)} min={1} max={9} ariaLabel="priority" />)}
              {part('est', 'Estimate', <Stepper value={form.v.est} onChange={(v) => setV('est', v)} min={0} max={80} step="est" suffix="h" ariaLabel="estimate" />)}
            </div>
            {part('due', 'Due date', (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select className="g-input" style={{ width: 230 }} value={form.v.due.kind}
                  onChange={(e) => setV('due', e.target.value === 'days' ? { kind: 'days', n: form.v.dueDays } : { kind: e.target.value as 'today' | 'eow' })}>
                  <option value="today">Today</option>
                  <option value="eow">End of week (Friday)</option>
                  <option value="days">In a number of days</option>
                </select>
                {form.v.due.kind === 'days' && <Stepper value={form.v.dueDays} onChange={(v) => setV('dueDays', v)} min={0} max={365} suffix="d" ariaLabel="days" />}
              </div>
            ), 'Worked out on the day you use the template.')}
            {part('desc_html', 'Notes', (
              <NotesEditor key={form.editorKey} initialHtml={form.v.desc_html} onChange={(html) => setV('desc_html', html)} minHeight={70} />
            ), 'Added under any notes the task already has.')}
            {part('subtasks', 'Subtasks', <SubtaskList value={form.v.subtasks} onChange={(s) => setV('subtasks', s)} />,
              "Added after the task's own. A subtask it already has is not added twice.")}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              {part('claude_model', 'Claude model', (
                <select className="g-input" value={form.v.claude_model} onChange={(e) => setV('claude_model', e.target.value as ModelId)}>
                  {CLAUDE_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
                </select>
              ), "Used instead of the feature's.")}
              {part('claude_effort', 'Claude effort', (
                <select className="g-input" value={form.v.claude_effort} onChange={(e) => setV('claude_effort', e.target.value as Effort)}>
                  {CLAUDE_EFFORTS.map((x) => <option key={x} value={x}>{x}</option>)}
                </select>
              ), "Used instead of the feature's.")}
            </div>
          </div>
        </div>
        <footer style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderTop: '1px solid var(--border)' }}>
          {form.id && <Button variant="danger" icon="trash-2" onClick={askDelete}>Delete</Button>}
          <span style={{ flex: 1, fontSize: 12.5, color: 'var(--danger)' }} role="alert">{error}</span>
          {!dirty && form.id && <span style={{ fontSize: 12.5, color: 'var(--fg-3)', display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icon name="check" size={13} />Saved</span>}
          <Button onClick={attemptClose}>Close</Button>
          <Button variant="primary" disabled={busy || (!dirty && !!form.id)} onClick={save}>{form.id ? 'Save template' : 'Create template'}</Button>
        </footer>
      </div>
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
    </div>,
    document.body,
  )
}

function Part({ label, on, onToggle, hint, children }: { label: string; on: boolean; onToggle: (v: boolean) => void; hint?: string; children: ReactNode }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: 12, background: on ? 'var(--bg-0)' : 'transparent' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{ ...capStyle, flex: 1 }}>{label}</span>
        <Toggle on={on} onChange={onToggle} label={`Set ${label.toLowerCase()}`} />
      </div>
      {on ? (
        <>
          {children}
          {hint && <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 7 }}>{hint}</div>}
        </>
      ) : (
        <button type="button" onClick={() => onToggle(true)}
          style={{ width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--fg-3)', fontSize: 12.5, cursor: 'pointer', opacity: 0.75 }}>
          Not set · leaves the task's own
        </button>
      )}
    </div>
  )
}

function SubtaskList({ value, onChange }: { value: Subtask[]; onChange: (s: Subtask[]) => void }) {
  const [text, setText] = useState('')
  const add = () => {
    const t = text.trim()
    if (!t) return
    onChange([...value, { t, done: false }])
    setText('')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {value.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5, color: 'var(--fg-1)' }}>
          <Icon name="list-checks" size={13} color="var(--fg-3)" />
          <span style={{ flex: 1 }}>{s.t}</span>
          <IconButton icon="x" size={22} label="Remove subtask" onClick={() => onChange(value.filter((_, j) => j !== i))} />
        </div>
      ))}
      <div style={{ display: 'flex', gap: 6 }}>
        <input className="g-input" value={text} placeholder="Add a subtask…" onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }} style={{ padding: '7px 10px', fontSize: 13 }} />
        <Button variant="outline" size="sm" disabled={!text.trim()} onClick={add}>Add</Button>
      </div>
    </div>
  )
}

