/**
 * TaskDrawer — slide-in panel from the right for creating and editing tasks.
 *
 * Opens in create mode (no taskId) or edit mode (taskId provided).
 * Fields: name, project picker, priority chips, notes, subtasks checklist,
 * time spent section (billable projects only).
 *
 * Behaviours:
 * - Slides in from right via .grove-drawer CSS animation.
 * - Clicking the backdrop closes the drawer; if isDirty, shows confirm-discard modal.
 * - Edit mode: saves via PATCH /api/tasks/:id + replace-all subtask sync.
 * - Create mode: saves via POST /api/tasks + POST subtasks.
 * - Delete button (edit mode only): confirm modal → DELETE /api/tasks/:id.
 * - Time section shown only when the selected project is billable.
 */

import { useState, useEffect, useRef } from 'react'

// ---- Types ------------------------------------------------------------------

export interface Project {
  id: number
  name: string
  color: string
  billable: boolean
  completed: boolean
}

interface SubtaskDraft {
  /** Temporary client-side key (not a real DB id until saved). */
  _key: string
  label: string
  checked: boolean
}

interface DrawerDraft {
  name: string
  project_id: number | null
  priority: 1 | 2 | 3 | 4
  notes: string
  subtasks: SubtaskDraft[]
  manual_adjustment_minutes: number
}

export interface TaskDrawerProps {
  /** undefined → create mode; number → edit mode for that task id */
  taskId?: number
  /** Non-completed projects available for picking */
  projects: Project[]
  /** Called after a successful save or delete so the board can refetch */
  onSaved: () => void
  /** Called to close the drawer (from cancel / after save / after delete) */
  onClose: () => void
}

// ---- Constants & helpers ---------------------------------------------------

/** Priority display config — matches BoardPage.PRIORITY_MAP and prototype colors */
export const PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: '#f0876a' },
  2: { label: 'High',     color: '#f5c542' },
  3: { label: 'Medium',   color: '#45d3bb' },
  4: { label: 'Low',      color: '#74897b' },
}

/** Format minutes → "Xh Ym" or "Ym" */
function fmtMinutes(total: number): string {
  if (total <= 0) return '0m'
  const h = Math.floor(total / 60)
  const m = total % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

/** Generate a simple client-side unique key for subtask drafts */
let _keyCounter = 0
function nextKey(): string {
  return `sub_${Date.now()}_${++_keyCounter}`
}

function blankDraft(defaultProjectId: number | null = null): DrawerDraft {
  return {
    name: '',
    project_id: defaultProjectId,
    priority: 2,
    notes: '',
    subtasks: [],
    manual_adjustment_minutes: 0,
  }
}

// ---- Label styles shared across fields ------------------------------------

const labelStyle: React.CSSProperties = {
  fontFamily: 'var(--font-body)',
  fontSize: 11,
  fontWeight: 700,
  letterSpacing: '0.12em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
}

const fieldInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 11,
  background: 'var(--bg-sunken)',
  border: '1px solid var(--border-default)',
  color: 'var(--text-strong)',
  fontFamily: 'var(--font-body)',
  fontSize: 14,
  outline: 'none',
  boxSizing: 'border-box',
  transition: 'border-color var(--dur-fast) var(--ease-grow), box-shadow var(--dur-fast) var(--ease-grow)',
}

// ---- ConfirmModal ----------------------------------------------------------

interface ConfirmModalProps {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * ConfirmModal — generic yes/no modal matching the Grove prototype design.
 */
function ConfirmModal({ title, message, confirmLabel, danger = true, onConfirm, onCancel }: ConfirmModalProps) {
  return (
    <div
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 55,
        background: 'rgba(4,8,6,0.66)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="grove-overlay"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 400, maxWidth: '100%',
          padding: 24, borderRadius: 20,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 11,
            background: danger ? 'var(--danger-soft)' : 'var(--warning-soft)',
            border: `1px solid ${danger ? 'var(--danger)' : 'var(--warning)'}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none"
              stroke={danger ? 'var(--clay-400)' : 'var(--warning)'}
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </span>
          <div style={{
            fontFamily: 'var(--font-display)', fontStretch: '125%',
            fontSize: 18, fontWeight: 800, color: 'var(--text-strong)',
          }}>
            {title}
          </div>
        </div>

        <p style={{ fontSize: 13.5, color: 'var(--text-body)', lineHeight: 1.55, margin: '0 0 18px' }}>
          {message}
        </p>

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, padding: 11, borderRadius: 11,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-2)',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13.5,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, padding: 11, borderRadius: 11,
              border: `1px solid ${danger ? 'var(--danger)' : 'var(--accent)'}`,
              background: danger ? 'var(--danger-soft)' : 'var(--accent-soft)',
              color: danger ? 'var(--clay-400)' : 'var(--canopy-300)',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 13.5,
              cursor: 'pointer',
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- TaskDrawer (main) -----------------------------------------------------

/**
 * TaskDrawer — slide-in panel for creating or editing a task.
 */
export function TaskDrawer({ taskId, projects, onSaved, onClose }: TaskDrawerProps) {
  const isEditMode = taskId !== undefined

  const [draft, setDraft] = useState<DrawerDraft>(blankDraft(projects[0]?.id ?? null))
  const [baseline, setBaseline] = useState('')
  const [sessionMinutes, setSessionMinutes] = useState(0)
  const [loading, setLoading] = useState(isEditMode)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modals
  const [showDiscardModal, setShowDiscardModal] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)

  // Focus first field on open
  const nameInputRef = useRef<HTMLInputElement>(null)

  // ---- Load task data in edit mode ----------------------------------------

  useEffect(() => {
    if (!isEditMode) {
      const d = blankDraft(projects.find((p) => !p.completed)?.id ?? null)
      setDraft(d)
      setBaseline(JSON.stringify(d))
      setLoading(false)
      setTimeout(() => nameInputRef.current?.focus(), 60)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/tasks/${taskId}`)
        if (!res.ok) throw new Error('Failed to load task')
        const data = await res.json()

        const d: DrawerDraft = {
          name: data.name,
          project_id: data.project_id,
          priority: data.priority as 1 | 2 | 3 | 4,
          notes: data.notes ?? '',
          subtasks: (data.subtasks ?? []).map((s: { id: number; label: string; checked: number | boolean }) => ({
            _key: nextKey(),
            label: s.label,
            checked: Boolean(s.checked),
          })),
          manual_adjustment_minutes: data.manual_adjustment_minutes ?? 0,
        }

        if (!cancelled) {
          setDraft(d)
          setBaseline(JSON.stringify(d))
          setSessionMinutes(data.session_minutes ?? 0)
          setLoading(false)
          setTimeout(() => nameInputRef.current?.focus(), 60)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load task')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [taskId, isEditMode]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---- Derived state -------------------------------------------------------

  const isDirty = JSON.stringify(draft) !== baseline

  const selectedProject = projects.find((p) => p.id === draft.project_id)
  const isBillable = selectedProject?.billable ?? false

  const totalMinutes = sessionMinutes + draft.manual_adjustment_minutes

  // ---- Backdrop click (with dirty check) -----------------------------------

  function handleBackdrop() {
    if (isDirty) {
      setShowDiscardModal(true)
    } else {
      onClose()
    }
  }

  function handleDiscard() {
    setShowDiscardModal(false)
    onClose()
  }

  // ---- Draft updaters -------------------------------------------------------

  function patchDraft(patch: Partial<DrawerDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  // ---- Subtask handlers ----------------------------------------------------

  function addSubtask() {
    patchDraft({
      subtasks: [...draft.subtasks, { _key: nextKey(), label: '', checked: false }],
    })
  }

  function removeSubtask(key: string) {
    patchDraft({ subtasks: draft.subtasks.filter((s) => s._key !== key) })
  }

  function toggleSubtask(key: string) {
    patchDraft({
      subtasks: draft.subtasks.map((s) =>
        s._key === key ? { ...s, checked: !s.checked } : s
      ),
    })
  }

  function updateSubtaskLabel(key: string, label: string) {
    patchDraft({
      subtasks: draft.subtasks.map((s) =>
        s._key === key ? { ...s, label } : s
      ),
    })
  }

  function handleSubtaskKeyDown(e: React.KeyboardEvent<HTMLInputElement>, key: string) {
    if (e.key === 'Enter') {
      e.preventDefault()
      // Find current index and focus the next one, or add a new one
      const idx = draft.subtasks.findIndex((s) => s._key === key)
      if (idx === draft.subtasks.length - 1) {
        addSubtask()
      }
      // Focus the next input after a tick (allows new subtask to render)
      setTimeout(() => {
        const inputs = document.querySelectorAll<HTMLInputElement>('.drawer-subtask-input')
        const nextInput = inputs[idx + 1]
        if (nextInput) nextInput.focus()
      }, 20)
    }
  }

  // ---- Manual adjustment chips ---------------------------------------------

  const MANUAL_CHIPS = [
    { label: '+5', delta: 5 },
    { label: '+15', delta: 15 },
    { label: '+30', delta: 30 },
    { label: '−5', delta: -5 },
  ]

  // ---- Save ----------------------------------------------------------------

  async function handleSave() {
    if (!draft.name.trim()) {
      setError('Task name is required.')
      nameInputRef.current?.focus()
      return
    }
    if (!draft.project_id) {
      setError('Please select a project.')
      return
    }
    setError(null)
    setSaving(true)

    try {
      if (isEditMode) {
        // PATCH task fields
        const patchRes = await fetch(`/api/tasks/${taskId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            project_id: draft.project_id,
            priority: draft.priority,
            notes: draft.notes || null,
            manual_adjustment_minutes: draft.manual_adjustment_minutes,
          }),
        })
        if (!patchRes.ok) throw new Error('Failed to update task')

        // Replace-all subtask sync: delete all then re-insert
        const delRes = await fetch(`/api/tasks/${taskId}/subtasks`, { method: 'DELETE' })
        if (!delRes.ok) throw new Error('Failed to clear subtasks')

        for (const sub of draft.subtasks) {
          if (!sub.label.trim()) continue
          await fetch(`/api/tasks/${taskId}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: sub.label.trim(), checked: sub.checked }),
          })
        }
      } else {
        // POST new task
        const postRes = await fetch('/api/tasks', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: draft.name.trim(),
            project_id: draft.project_id,
            priority: draft.priority,
            notes: draft.notes || null,
          }),
        })
        if (!postRes.ok) throw new Error('Failed to create task')
        const newTask = await postRes.json()

        // POST subtasks
        for (const sub of draft.subtasks) {
          if (!sub.label.trim()) continue
          await fetch(`/api/tasks/${newTask.id}/subtasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ label: sub.label.trim(), checked: sub.checked }),
          })
        }
      }

      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  // ---- Delete --------------------------------------------------------------

  async function handleDeleteConfirmed() {
    setShowDeleteModal(false)
    setSaving(true)
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed to delete task')
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
      setSaving(false)
    }
  }

  // ---- Render --------------------------------------------------------------

  const activeProjects = projects.filter((p) => !p.completed)
  const completedSubtasks = draft.subtasks.filter((s) => s.checked).length
  const subCountLabel = draft.subtasks.length > 0
    ? `(${completedSubtasks}/${draft.subtasks.length})`
    : ''

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleBackdrop}
        style={{
          position: 'fixed', inset: 0, zIndex: 40,
          background: 'rgba(4,8,6,0.62)',
          backdropFilter: 'blur(3px)',
          WebkitBackdropFilter: 'blur(3px)',
          display: 'flex', justifyContent: 'flex-end',
        }}
      >
        {/* Panel — stopPropagation prevents backdrop click */}
        <div
          className="grove-drawer"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 440, maxWidth: '92vw', height: '100%',
            background: 'var(--surface-1)',
            borderLeft: '1px solid var(--border-strong)',
            boxShadow: 'var(--shadow-xl)',
            display: 'flex', flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '18px 22px',
            borderBottom: '1px solid var(--border-default)',
          }}>
            <span style={{
              fontFamily: 'var(--font-display)', fontStretch: '125%',
              fontSize: 17, fontWeight: 800,
              color: 'var(--text-strong)', letterSpacing: '-0.01em',
            }}>
              {isEditMode ? 'Edit task' : 'New task'}
            </span>
            <button
              onClick={handleBackdrop}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 32, height: 32, borderRadius: 9,
                border: '1px solid var(--border-default)',
                background: 'var(--surface-2)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              aria-label="Close"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Scrollable body */}
          {loading ? (
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 13,
            }}>
              Loading…
            </div>
          ) : (
            <div
              className="grove-scroll"
              style={{ flex: 1, overflowY: 'auto', padding: 22, display: 'flex', flexDirection: 'column', gap: 20 }}
            >
              {/* Error banner */}
              {error && (
                <div style={{
                  padding: '10px 13px', borderRadius: 10,
                  background: 'var(--danger-soft)',
                  border: '1px solid var(--danger)',
                  color: 'var(--clay-400)',
                  fontFamily: 'var(--font-body)', fontSize: 13,
                }}>
                  {error}
                </div>
              )}

              {/* Task name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Task name</label>
                <input
                  ref={nameInputRef}
                  value={draft.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  placeholder="What needs doing?"
                  style={fieldInputStyle}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.boxShadow = 'var(--glow-focus)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Project picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Project</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
                  {activeProjects.map((p) => {
                    const isSelected = draft.project_id === p.id
                    return (
                      <button
                        key={p.id}
                        onClick={() => patchDraft({ project_id: p.id })}
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 7,
                          padding: '7px 12px',
                          borderRadius: 'var(--radius-pill)',
                          border: `1px solid ${isSelected ? p.color + '55' : 'var(--border-default)'}`,
                          background: isSelected ? p.color + '18' : 'transparent',
                          color: isSelected ? 'var(--text-strong)' : 'var(--text-muted)',
                          fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all var(--dur-fast) var(--ease-grow)',
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.color, flexShrink: 0 }} />
                        {p.name}
                      </button>
                    )
                  })}
                  {activeProjects.length === 0 && (
                    <span style={{ fontSize: 13, color: 'var(--text-faint)' }}>No active projects.</span>
                  )}
                </div>
              </div>

              {/* Priority picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Priority</label>
                <div style={{ display: 'flex', gap: 7 }}>
                  {([1, 2, 3, 4] as const).map((p) => {
                    const pri = PRIORITY_MAP[p]
                    const isSelected = draft.priority === p
                    return (
                      <button
                        key={p}
                        onClick={() => patchDraft({ priority: p })}
                        style={{
                          flex: 1,
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                          padding: '9px 6px',
                          borderRadius: 11,
                          border: `1px solid ${isSelected ? pri.color + '55' : 'var(--border-default)'}`,
                          background: isSelected ? pri.color + '18' : 'transparent',
                          color: isSelected ? pri.color : 'var(--text-muted)',
                          fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all var(--dur-fast) var(--ease-grow)',
                        }}
                      >
                        <span style={{
                          width: 7, height: 7, borderRadius: '50%',
                          background: pri.color, flexShrink: 0,
                        }} />
                        {pri.label}
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Notes */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Notes</label>
                <textarea
                  value={draft.notes}
                  onChange={(e) => patchDraft({ notes: e.target.value })}
                  placeholder="Context, links, acceptance criteria…"
                  style={{
                    ...fieldInputStyle,
                    minHeight: 86,
                    lineHeight: 1.55,
                    resize: 'vertical',
                    height: 'auto',
                    fontSize: 13.5,
                  }}
                  onFocus={(e) => {
                    e.currentTarget.style.borderColor = 'var(--accent)'
                    e.currentTarget.style.boxShadow = 'var(--glow-focus)'
                  }}
                  onBlur={(e) => {
                    e.currentTarget.style.borderColor = 'var(--border-default)'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                />
              </div>

              {/* Subtasks */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <label style={labelStyle}>
                  Subtasks{subCountLabel ? ` ${subCountLabel}` : ''}
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  {draft.subtasks.map((sub) => (
                    <div key={sub._key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      {/* Checkbox */}
                      <button
                        onClick={() => toggleSubtask(sub._key)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 21, height: 21, borderRadius: 7, flexShrink: 0,
                          border: `1px solid ${sub.checked ? 'var(--accent)' : 'var(--border-strong)'}`,
                          background: sub.checked ? 'var(--accent)' : 'transparent',
                          color: 'var(--text-on-accent)',
                          cursor: 'pointer',
                        }}
                        aria-label={sub.checked ? 'Uncheck subtask' : 'Check subtask'}
                      >
                        {sub.checked && (
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        )}
                      </button>

                      {/* Label input */}
                      <input
                        className="drawer-subtask-input"
                        value={sub.label}
                        onChange={(e) => updateSubtaskLabel(sub._key, e.target.value)}
                        onKeyDown={(e) => handleSubtaskKeyDown(e, sub._key)}
                        placeholder="Subtask…"
                        style={{
                          flex: 1, padding: '8px 11px', borderRadius: 9,
                          background: 'var(--bg-sunken)',
                          border: '1px solid var(--border-subtle)',
                          color: sub.checked ? 'var(--text-faint)' : 'var(--text-strong)',
                          fontFamily: 'var(--font-body)', fontSize: 13,
                          outline: 'none',
                          textDecoration: sub.checked ? 'line-through' : 'none',
                        }}
                        onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--accent)' }}
                        onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-subtle)' }}
                      />

                      {/* Remove button */}
                      <button
                        onClick={() => removeSubtask(sub._key)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                          border: 'none', background: 'transparent',
                          color: 'var(--text-faint)',
                          cursor: 'pointer',
                          transition: 'color var(--dur-fast) var(--ease-grow)',
                        }}
                        onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--clay-400)' }}
                        onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-faint)' }}
                        aria-label="Remove subtask"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M18 6 6 18M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}

                  {/* Add subtask button */}
                  <button
                    onClick={addSubtask}
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 7,
                      alignSelf: 'flex-start',
                      padding: '7px 11px', borderRadius: 9,
                      border: '1px dashed var(--border-strong)',
                      background: 'transparent',
                      color: 'var(--text-muted)',
                      fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    Add subtask
                  </button>
                </div>
              </div>

              {/* Time spent — only for billable projects */}
              {isBillable && (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 11,
                  padding: 16, borderRadius: 14,
                  background: 'var(--surface-card)',
                  border: '1px solid var(--border-default)',
                }}>
                  <label style={labelStyle}>Time spent</label>

                  {/* Total display */}
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                    <span style={{
                      fontFamily: 'var(--font-display)', fontStretch: '125%',
                      fontSize: 30, fontWeight: 800,
                      color: 'var(--canopy-300)', letterSpacing: '-0.02em',
                    }}>
                      {fmtMinutes(totalMinutes)}
                    </span>
                    <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>total</span>
                  </div>

                  {/* Breakdown */}
                  <div style={{
                    display: 'flex', flexDirection: 'column', gap: 5,
                    fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)',
                    padding: '9px 0',
                    borderTop: '1px solid var(--border-subtle)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Auto-tracked</span>
                      <span style={{ color: 'var(--text-body)' }}>{fmtMinutes(sessionMinutes)}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Manual adjustment</span>
                      <span style={{
                        color: draft.manual_adjustment_minutes >= 0 ? 'var(--canopy-300)' : 'var(--clay-400)',
                      }}>
                        {draft.manual_adjustment_minutes >= 0 ? '+' : ''}{fmtMinutes(Math.abs(draft.manual_adjustment_minutes))}
                      </span>
                    </div>
                  </div>

                  {/* Adjustment chips + exact input */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                    {MANUAL_CHIPS.map((chip) => (
                      <button
                        key={chip.label}
                        onClick={() => patchDraft({ manual_adjustment_minutes: draft.manual_adjustment_minutes + chip.delta })}
                        style={{
                          padding: '7px 12px', borderRadius: 9,
                          border: '1px solid var(--border-default)',
                          background: 'var(--surface-2)',
                          color: 'var(--text-body)',
                          fontFamily: 'var(--font-mono)', fontSize: 12, fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all var(--dur-fast) var(--ease-grow)',
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent)'
                          e.currentTarget.style.color = 'var(--canopy-300)'
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-default)'
                          e.currentTarget.style.color = 'var(--text-body)'
                        }}
                      >
                        {chip.label}
                      </button>
                    ))}

                    {/* Exact minutes input */}
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginLeft: 'auto' }}>
                      <input
                        type="number"
                        value={draft.manual_adjustment_minutes}
                        onChange={(e) => patchDraft({ manual_adjustment_minutes: Number(e.target.value) || 0 })}
                        style={{
                          width: 64, padding: '7px 9px', borderRadius: 9,
                          background: 'var(--bg-sunken)',
                          border: '1px solid var(--border-default)',
                          color: 'var(--text-strong)',
                          fontFamily: 'var(--font-mono)', fontSize: 12.5,
                          textAlign: 'right', outline: 'none',
                        }}
                        onFocus={(e) => {
                          e.currentTarget.style.borderColor = 'var(--accent)'
                          e.currentTarget.style.boxShadow = 'var(--glow-focus)'
                        }}
                        onBlur={(e) => {
                          e.currentTarget.style.borderColor = 'var(--border-default)'
                          e.currentTarget.style.boxShadow = 'none'
                        }}
                      />
                      <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-faint)' }}>min</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '16px 22px',
            borderTop: '1px solid var(--border-default)',
          }}>
            {/* Delete button — edit mode only */}
            {isEditMode && (
              <button
                onClick={() => setShowDeleteModal(true)}
                disabled={saving}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 42, height: 42, borderRadius: 12, flexShrink: 0,
                  border: '1px solid var(--danger)',
                  background: 'var(--danger-soft)',
                  color: 'var(--clay-400)',
                  cursor: saving ? 'not-allowed' : 'pointer',
                  opacity: saving ? 0.5 : 1,
                }}
                aria-label="Delete task"
              >
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
                </svg>
              </button>
            )}

            {/* Cancel */}
            <button
              onClick={handleBackdrop}
              disabled={saving}
              style={{
                flex: 1, padding: 12, borderRadius: 12,
                border: '1px solid var(--border-strong)',
                background: 'var(--surface-2)',
                color: 'var(--text-strong)',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
                cursor: saving ? 'not-allowed' : 'pointer',
                opacity: saving ? 0.5 : 1,
              }}
            >
              Cancel
            </button>

            {/* Save */}
            <button
              onClick={handleSave}
              disabled={saving || loading}
              style={{
                flex: 2,
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                padding: 12, borderRadius: 12,
                border: '1px solid transparent',
                background: 'var(--grad-canopy)',
                color: 'var(--text-on-accent)',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
                cursor: (saving || loading) ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--glow-accent)',
                opacity: (saving || loading) ? 0.7 : 1,
              }}
            >
              {saving ? 'Saving…' : isEditMode ? 'Save changes' : 'Create task'}
            </button>
          </div>
        </div>
      </div>

      {/* Confirm-discard modal */}
      {showDiscardModal && (
        <ConfirmModal
          title="Discard changes?"
          message="You have unsaved changes. They will be lost if you close the drawer now."
          confirmLabel="Discard"
          danger={false}
          onConfirm={handleDiscard}
          onCancel={() => setShowDiscardModal(false)}
        />
      )}

      {/* Delete task modal */}
      {showDeleteModal && (
        <ConfirmModal
          title="Delete task?"
          message={`This permanently removes "${draft.name || 'this task'}" and all its subtasks, blocked history, and tracked time.`}
          confirmLabel="Delete task"
          danger
          onConfirm={handleDeleteConfirmed}
          onCancel={() => setShowDeleteModal(false)}
        />
      )}
    </>
  )
}
