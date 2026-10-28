/**
 * NotesPage — meeting notes. `#/notes` is the list (date range, search,
 * feature filter); `#/notes/<id>` is one note with autosave and a list of
 * open action items that can be promoted to tasks.
 *
 * Notes are not part of /api/state; this page loads them itself.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Feature, Note, NoteRow } from '../types'
import { api } from '../api'
import { localDate, shiftDate, openActions, NOTE_DEFAULT_DAYS } from '../lib'
import { Icon } from '../components/Icon'
import { Button, Field, IconButton, PageHeader, SectionLabel, type ConfirmSpec } from '../components/ui'
import { FeatureDot } from '../components/skin'
import { FeaturePicker } from '../components/FeaturePicker'
import { NotesEditor } from '../components/NotesEditor'

export const AUTOSAVE_MS = 1500

/** Same hash scheme as App's navigate (not imported, to avoid a cycle). */
function navigate(...parts: string[]) {
  location.hash = '#/' + parts.map(encodeURIComponent).join('/')
}

export interface PromoteSpec {
  title: string
  feature: string
  desc: string
}

interface Props {
  features: Feature[]
  noteId?: string
  onPromote: (spec: PromoteSpec) => Promise<void>
  onConfirm: (spec: ConfirmSpec) => void
}

export function NotesPage({ noteId, ...rest }: Props) {
  return noteId ? <NoteDetail id={noteId} {...rest} /> : <NoteList features={rest.features} />
}

// ---- list -------------------------------------------------------------------

function NoteList({ features }: { features: Feature[] }) {
  const today = localDate()
  const [q, setQ] = useState('')
  const [from, setFrom] = useState(shiftDate(today, -NOTE_DEFAULT_DAYS))
  const [to, setTo] = useState(today)
  const [feature, setFeature] = useState('')
  const [rows, setRows] = useState<NoteRow[] | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const p = new URLSearchParams()
    const words = q.trim()
    // With search text the server looks across all dates, so a typed search
    // only narrows by date when the user changed the range.
    if (words) p.set('q', words)
    const defaultRange = from === shiftDate(today, -NOTE_DEFAULT_DAYS) && to === today
    if (!words || !defaultRange) {
      if (from) p.set('from', from)
      if (to) p.set('to', to)
    }
    if (feature) p.set('feature', feature)
    const timer = setTimeout(() => {
      api<NoteRow[]>('GET', `/api/notes?${p}`).then((r) => { setRows(r); setError('') }).catch((e) => setError(e.message))
    }, words ? 250 : 0)
    return () => clearTimeout(timer)
  }, [q, from, to, feature, today])

  const create = async () => {
    const n = await api<Note>('POST', '/api/notes', { feature_id: feature && feature !== 'none' ? feature : null })
    navigate('notes', n.id)
  }
  const byId = new Map(features.map((f) => [f.id, f]))

  return (
    <div style={{ maxWidth: 900 }}>
      <PageHeader title="Notes" subtitle="Meeting notes and their action items. Buddy reads these in its briefing."
        actions={<Button variant="primary" icon="plus" onClick={create}>New note</Button>} />

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center', margin: '18px 0 14px' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Icon name="search" size={14} color="var(--fg-3)" style={{ position: 'absolute', left: 10, top: 11 }} />
          <input className="g-input" value={q} placeholder="Search notes and transcripts…" aria-label="Search notes"
            onChange={(e) => setQ(e.target.value)} style={{ paddingLeft: 30 }} />
        </div>
        <input type="date" className="g-input" value={from} aria-label="From" onChange={(e) => setFrom(e.target.value)} style={{ width: 150 }} />
        <span style={{ color: 'var(--fg-3)', fontSize: 13 }}>to</span>
        <input type="date" className="g-input" value={to} aria-label="To" onChange={(e) => setTo(e.target.value)} style={{ width: 150 }} />
        <select className="g-input" value={feature} aria-label="Feature" onChange={(e) => setFeature(e.target.value)} style={{ width: 170 }}>
          <option value="">All features</option>
          <option value="none">No feature</option>
          {features.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
        </select>
      </div>
      {q.trim() && <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--fg-3)' }}>Search covers all dates unless you change the range.</p>}

      {error && <p style={{ color: 'var(--danger)' }}>{error}</p>}
      {rows && rows.length === 0 && (
        <div style={{ padding: 28, textAlign: 'center', color: 'var(--fg-3)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-md)' }}>
          {q.trim() ? `No notes match “${q.trim()}”.` : 'No notes in this range.'}
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {rows?.map((n) => {
          const f = n.feature_id ? byId.get(n.feature_id) : undefined
          return (
            <a key={n.id} href={`#/notes/${encodeURIComponent(n.id)}`} className="g-row-hover" style={{
              display: 'block', padding: '12px 16px', background: 'var(--bg-1)', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)', color: 'inherit', textDecoration: 'none',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12, color: 'var(--fg-3)', flexShrink: 0 }}>{n.meeting_date}</span>
                <span style={{ fontWeight: 650, color: 'var(--fg-1)', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.title}</span>
                {f && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--fg-2)' }}><FeatureDot feature={f} size={8} />{f.name}</span>}
                {n.actions.total > 0 && (
                  <span title="Open action items" style={{
                    fontSize: 11.5, fontFamily: 'var(--font-mono)', padding: '2px 7px', borderRadius: 999,
                    background: n.actions.open ? 'var(--warning-tint)' : 'var(--success-tint)', color: n.actions.open ? 'var(--warning)' : 'var(--success)',
                  }}>{n.actions.open}/{n.actions.total} open</span>
                )}
                {n.has_transcript && <Icon name="file-text" size={14} color="var(--fg-3)" />}
              </div>
              {n.excerpt && <div style={{ marginTop: 6, fontSize: 13, color: 'var(--fg-3)', lineHeight: 1.5 }}>{n.excerpt}</div>}
            </a>
          )
        })}
      </div>
    </div>
  )
}

// ---- detail -----------------------------------------------------------------

type Patch = Partial<Pick<Note, 'title' | 'meeting_date' | 'feature_id' | 'body_html' | 'transcript'>>

function NoteDetail({ id, features, onPromote, onConfirm }: { id: string } & Omit<Props, 'noteId'>) {
  const [note, setNote] = useState<Note | null>(null)
  const [missing, setMissing] = useState(false)
  const [status, setStatus] = useState<'saved' | 'saving' | 'unsaved' | 'error'>('saved')
  const [promoting, setPromoting] = useState<string | null>(null)
  const [promoted, setPromoted] = useState<string[]>([])
  const [transcriptOpen, setTranscriptOpen] = useState(false)
  const pending = useRef<Patch>({})
  const timer = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    api<Note>('GET', `/api/notes/${encodeURIComponent(id)}`)
      .then((n) => { setNote(n); setTranscriptOpen(!!n.transcript) })
      .catch(() => setMissing(true))
  }, [id])

  /** Send whatever is pending. `keepalive` lets it finish while the page unloads. */
  const flush = useCallback((keepalive = false) => {
    clearTimeout(timer.current)
    const body = pending.current
    if (!Object.keys(body).length) return
    pending.current = {}
    setStatus('saving')
    if (keepalive) {
      void fetch(`/api/notes/${encodeURIComponent(id)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), keepalive: true,
      })
      return
    }
    api<Note>('PATCH', `/api/notes/${encodeURIComponent(id)}`, body)
      .then((n) => {
        setNote((cur) => (cur ? { ...cur, actions: n.actions, feature_name: n.feature_name, updated_at: n.updated_at } : n))
        setStatus(Object.keys(pending.current).length ? 'unsaved' : 'saved')
      })
      .catch(() => { pending.current = { ...body, ...pending.current }; setStatus('error') })
  }, [id])

  const change = (patch: Patch, now = false) => {
    setNote((n) => (n ? { ...n, ...patch } : n))
    pending.current = { ...pending.current, ...patch }
    setStatus('unsaved')
    clearTimeout(timer.current)
    if (now) flush()
    else timer.current = setTimeout(() => flush(), AUTOSAVE_MS)
  }

  useEffect(() => {
    const onLeave = () => flush(true)
    window.addEventListener('beforeunload', onLeave)
    return () => { window.removeEventListener('beforeunload', onLeave); flush(true) }
  }, [flush])

  if (missing) {
    return (
      <div>
        <PageHeader title="Note not found" />
        <Button icon="chevrons-left" onClick={() => navigate('notes')}>All notes</Button>
      </div>
    )
  }
  if (!note) return <div style={{ color: 'var(--fg-3)' }}>Loading…</div>

  const items = openActions(note.body_html).filter((t) => !promoted.includes(t))
  const promote = async (title: string, feature: string) => {
    setPromoting(null)
    await onPromote({ title, feature, desc: `From meeting note "${note.title}" (${note.meeting_date}): #/notes/${note.id}` })
    setPromoted((p) => [...p, title])
  }
  const remove = () => onConfirm({
    title: 'Delete this note?', body: `"${note.title}" and its transcript will be gone for good. Tasks made from it stay.`,
    confirm: 'Delete note', danger: true,
    onConfirm: async () => { pending.current = {}; await api('DELETE', `/api/notes/${encodeURIComponent(note.id)}`); navigate('notes') },
  })
  const statusText = { saved: 'Saved', saving: 'Saving…', unsaved: 'Unsaved changes', error: 'Not saved — will retry on next edit' }[status]

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 520px', minWidth: 0, maxWidth: 860 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Button size="sm" icon="chevrons-left" onClick={() => { flush(); navigate('notes') }}>All notes</Button>
          <span style={{ flex: 1 }} />
          <span aria-live="polite" style={{ fontSize: 12, color: status === 'error' ? 'var(--danger)' : 'var(--fg-3)' }}>{statusText}</span>
          <IconButton icon="trash-2" label="Delete note" onClick={remove} />
        </div>
        <input className="g-input" value={note.title} aria-label="Title" placeholder="Meeting title"
          onChange={(e) => change({ title: e.target.value })} onBlur={() => flush()}
          style={{ fontSize: 22, fontWeight: 700, padding: '8px 12px', marginBottom: 12 }} />
        <div style={{ display: 'grid', gridTemplateColumns: '170px 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="Meeting date">
            <input type="date" className="g-input" value={note.meeting_date} required
              onChange={(e) => { if (e.target.value) change({ meeting_date: e.target.value }, true) }} />
          </Field>
          <Field label="Feature" right={note.feature_id ? (
            <button type="button" className="g-btn" onClick={() => change({ feature_id: null }, true)}
              style={{ border: 'none', background: 'none', color: 'var(--fg-3)', fontSize: 12, cursor: 'pointer' }}>Clear</button>
          ) : undefined}>
            <FeaturePicker features={features} value={note.feature_id ?? ''} onChange={(fid) => change({ feature_id: fid }, true)} />
          </Field>
        </div>
        <NotesEditor key={note.id} taskList initialHtml={note.body_html} minHeight={320}
          placeholder="Notes… use the checkbox button for action items"
          onChange={(html) => change({ body_html: html })} onBlur={() => flush()} />

        <div style={{ marginTop: 16 }}>
          <button type="button" className="g-btn" onClick={() => setTranscriptOpen((o) => !o)} aria-expanded={transcriptOpen}
            style={{ display: 'flex', alignItems: 'center', gap: 6, border: 'none', background: 'none', color: 'var(--fg-2)', cursor: 'pointer', padding: 0, fontSize: 13, fontWeight: 600 }}>
            <Icon name="chevron-down" size={14} style={{ transform: transcriptOpen ? 'none' : 'rotate(-90deg)', transition: 'transform var(--dur-fast)' }} />
            Transcript {note.transcript.trim() ? '' : '(none)'}
          </button>
          {transcriptOpen && (
            <textarea className="g-input" value={note.transcript} placeholder="Paste a transcript here. It is searched, and Buddy can read it."
              onChange={(e) => change({ transcript: e.target.value })} onBlur={() => flush()}
              style={{ marginTop: 8, minHeight: 180, fontFamily: 'var(--font-mono)', fontSize: 12.5, lineHeight: 1.5, resize: 'vertical' }} />
          )}
        </div>
      </div>

      <aside style={{ flex: '0 1 280px', minWidth: 240, position: 'sticky', top: 0 }}>
        <SectionLabel>Open action items</SectionLabel>
        {items.length === 0 && <p style={{ fontSize: 13, color: 'var(--fg-3)', margin: '6px 0' }}>None. Add one with the checkbox button.</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          {items.map((t, i) => (
            <div key={`${i}-${t}`} style={{ padding: '9px 10px', background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)' }}>
              <div style={{ fontSize: 13, color: 'var(--fg-1)', lineHeight: 1.4 }}>{t}</div>
              {promoting === t ? (
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 12, color: 'var(--fg-3)', marginBottom: 4 }}>Every task needs a feature:</div>
                  <FeaturePicker features={features} value="" onChange={(fid) => void promote(t, fid)} />
                </div>
              ) : (
                <Button size="sm" icon="arrow-up-right" style={{ marginTop: 6 }}
                  onClick={() => (note.feature_id ? void promote(t, note.feature_id) : setPromoting(t))}>Promote to task</Button>
              )}
            </div>
          ))}
        </div>
        {promoted.length > 0 && (
          <p style={{ fontSize: 12.5, color: 'var(--success)', marginTop: 10 }}>
            {promoted.length} task{promoted.length === 1 ? '' : 's'} added to the Backlog.
          </p>
        )}
      </aside>
    </div>
  )
}
