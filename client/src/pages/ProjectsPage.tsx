/**
 * ProjectsPage — /projects route.
 *
 * Renders active and completed projects in separate sections matching
 * the Grove Board prototype layout. Supports create, mark complete/reopen,
 * and delete with a confirmation modal.
 */

import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'

// ---- Types ----------------------------------------------------------------

interface Project {
  id: number
  name: string
  color: string
  billable: boolean
  completed: boolean
  created_at: string
  task_count: number
  done_count: number
}

// ---- Color palette --------------------------------------------------------

/** 12 preset project colors — must match server/src/routes/projects.js */
export const PROJECT_COLORS = [
  '#3B82F6', // blue
  '#06B6D4', // cyan
  '#10B981', // emerald
  '#84CC16', // lime
  '#EAB308', // yellow
  '#F97316', // orange
  '#EF4444', // red
  '#EC4899', // pink
  '#A855F7', // purple
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#F59E0B', // amber
]

/** Returns a soft translucent version of a hex color for icon backgrounds. */
function colorSoft(hex: string): string {
  return hex + '22' // ~13% opacity
}

/** Percent done as a CSS width string. */
function donePct(done: number, total: number): string {
  if (!total) return '0%'
  return `${Math.round((done / total) * 100)}%`
}

// ---- API helpers ----------------------------------------------------------

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('Failed to load projects')
  return res.json()
}

async function createProject(payload: { name: string; color: string; billable: boolean }): Promise<Project> {
  const res = await fetch('/api/projects', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.errors?.join(', ') ?? 'Failed to create project')
  }
  return res.json()
}

async function patchProject(id: number, patch: Partial<Project>): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error('Failed to update project')
  return res.json()
}

async function deleteProject(id: number): Promise<{ deleted_task_count: number }> {
  const res = await fetch(`/api/projects/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error('Failed to delete project')
  return res.json()
}

// ---- New Project Modal ----------------------------------------------------

interface NewProjectModalProps {
  onClose: () => void
  onCreated: (p: Project) => void
}

/**
 * NewProjectModal — slide-up overlay for creating a project.
 * Contains name field, 12-color picker, and billable toggle.
 */
function NewProjectModal({ onClose, onCreated }: NewProjectModalProps) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(PROJECT_COLORS[0])
  const [billable, setBillable] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) { setError('Project name is required'); return }
    setSaving(true)
    setError(null)
    try {
      const created = await createProject({ name: name.trim(), color, billable })
      onCreated(created)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setSaving(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(4,8,6,0.66)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="grove-overlay"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 440, maxWidth: '100%',
          padding: 24,
          borderRadius: 20,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>
            New project
          </h2>
          <button
            onClick={onClose}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 32, height: 32, borderRadius: 9,
              border: '1px solid var(--border-default)',
              background: 'var(--surface-2)',
              color: 'var(--text-muted)', cursor: 'pointer',
            }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
          {/* Name */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Project name
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="What are you working on?"
              autoFocus
              style={{
                width: '100%', padding: '11px 13px', borderRadius: 11,
                background: 'var(--bg-sunken)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-strong)',
                fontFamily: 'var(--font-body)', fontSize: 14,
                outline: 'none',
              }}
            />
          </div>

          {/* Color picker */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <label style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              Color
            </label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {PROJECT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  title={c}
                  style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: c,
                    border: color === c ? '2px solid var(--text-strong)' : '2px solid transparent',
                    outline: color === c ? '2px solid ' + c : 'none',
                    outlineOffset: 2,
                    cursor: 'pointer',
                    boxShadow: color === c ? '0 0 0 3px rgba(255,255,255,0.2)' : undefined,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Billable toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <span style={{ fontFamily: 'var(--font-body)', fontSize: 13.5, fontWeight: 600, color: 'var(--text-body)' }}>
              Billable project
            </span>
            <button
              type="button"
              onClick={() => setBillable((b) => !b)}
              style={{
                position: 'relative', width: 42, height: 24, borderRadius: 12,
                background: billable ? 'var(--accent)' : 'var(--surface-3)',
                border: 'none', cursor: 'pointer',
                transition: 'background var(--dur-fast) var(--ease-grow)',
              }}
            >
              <span
                style={{
                  position: 'absolute', top: 3,
                  left: billable ? 21 : 3,
                  width: 18, height: 18, borderRadius: '50%',
                  background: billable ? 'var(--ink-950)' : 'var(--mist-400)',
                  transition: 'left var(--dur-fast) var(--ease-grow)',
                }}
              />
            </button>
          </div>

          {error && (
            <p style={{ margin: 0, fontSize: 13, color: 'var(--clay-400)' }}>{error}</p>
          )}

          <div style={{ display: 'flex', gap: 10 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                flex: 1, padding: 12, borderRadius: 12,
                border: '1px solid var(--border-strong)',
                background: 'var(--surface-2)',
                color: 'var(--text-strong)',
                fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              style={{
                flex: 2, padding: 12, borderRadius: 12,
                border: '1px solid transparent',
                background: 'var(--grad-canopy)',
                color: 'var(--text-on-accent)',
                fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: saving ? 'not-allowed' : 'pointer',
                boxShadow: 'var(--glow-accent)',
                opacity: saving ? 0.7 : 1,
              }}
            >
              {saving ? 'Creating…' : 'Create project'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ---- Delete Confirm Modal -------------------------------------------------

interface DeleteConfirmModalProps {
  project: Project
  onClose: () => void
  onDeleted: (id: number) => void
}

/**
 * DeleteConfirmModal — confirms deletion and states how many tasks will be removed.
 */
function DeleteConfirmModal({ project, onClose, onDeleted }: DeleteConfirmModalProps) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteProject(project.id)
      onDeleted(project.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
      setDeleting(false)
    }
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 50,
        background: 'rgba(4,8,6,0.66)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 24,
      }}
    >
      <div
        className="grove-overlay"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420, maxWidth: '100%',
          padding: 24, borderRadius: 20,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          <span style={{
            width: 38, height: 38, borderRadius: 11,
            background: 'var(--danger-soft)',
            border: '1px solid var(--danger)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="var(--clay-400)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
            </svg>
          </span>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontStretch: '125%', fontSize: 18, fontWeight: 800, color: 'var(--text-strong)' }}>
              Delete project?
            </div>
            <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              {project.name}
            </div>
          </div>
        </div>

        <p style={{ fontSize: 13, color: 'var(--text-muted)', lineHeight: 1.5, margin: '12px 0 16px' }}>
          This will also delete{' '}
          <strong style={{ color: 'var(--text-body)' }}>{project.task_count} {project.task_count === 1 ? 'task' : 'tasks'}</strong>{' '}
          and all their subtasks, time sessions, and blocked reasons. This cannot be undone.
        </p>

        {error && (
          <p style={{ margin: '0 0 12px', fontSize: 13, color: 'var(--clay-400)' }}>{error}</p>
        )}

        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={onClose}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-2)',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14, cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            style={{
              flex: 1, padding: '10px 16px', borderRadius: 12,
              border: '1px solid var(--danger)',
              background: 'var(--danger-soft)',
              color: 'var(--clay-400)',
              fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14,
              cursor: deleting ? 'not-allowed' : 'pointer',
              opacity: deleting ? 0.7 : 1,
            }}
          >
            {deleting ? 'Deleting…' : 'Delete project'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---- Project Card (Active) ------------------------------------------------

interface ActiveProjectCardProps {
  project: Project
  onComplete: (id: number) => void
  onDeleteClick: (p: Project) => void
  onNavigate: (id: number) => void
}

/**
 * ActiveProjectCard — card with color stripe, icon, progress bar,
 * and "Mark complete" button. Clicking the card body navigates to the project detail page.
 */
function ActiveProjectCard({ project, onComplete, onDeleteClick, onNavigate }: ActiveProjectCardProps) {
  return (
    <div
      className="grove-card"
      onClick={() => onNavigate(project.id)}
      style={{
        position: 'relative', overflow: 'hidden',
        padding: 18, borderRadius: 18,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        boxShadow: 'var(--shadow-md), var(--ring-inset)',
        cursor: 'pointer',
        transition: 'transform var(--dur-base) var(--ease-grow), box-shadow var(--dur-base) var(--ease-grow), border-color var(--dur-base) var(--ease-grow)',
      }}
      onMouseEnter={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-3px)'
        el.style.boxShadow = 'var(--glow-accent), var(--ring-inset)'
        el.style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={(e) => {
        const el = e.currentTarget as HTMLElement
        el.style.transform = ''
        el.style.boxShadow = 'var(--shadow-md), var(--ring-inset)'
        el.style.borderColor = 'var(--border-default)'
      }}
    >
      {/* Color stripe at top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 4, background: project.color }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          {/* Color icon */}
          <span style={{
            width: 34, height: 34, borderRadius: 11,
            background: colorSoft(project.color),
            border: `1px solid ${project.color}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke={project.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 22V8M9 5c0-2 1.2-3 3-3s3 1 3 3" />
              <path d="M8 13c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4ZM16 13c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z" />
            </svg>
          </span>

          <div style={{ minWidth: 0 }}>
            <div style={{
              fontFamily: 'var(--font-body)', fontSize: 15.5, fontWeight: 700,
              color: 'var(--text-strong)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {project.name}
            </div>
            {project.billable && (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--sun-300)' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" />
                  <path d="M14.5 9.2a2.4 2.4 0 0 0-2.5-1.7c-1.3 0-2.4.8-2.4 2 0 2.6 4.8 1.6 4.8 4 0 1.2-1.1 2-2.4 2a2.4 2.4 0 0 1-2.5-1.7M12 6v1.5M12 16.5V18" />
                </svg>
                BILLABLE
              </span>
            )}
          </div>
        </div>

        {/* Delete button */}
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteClick(project) }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 30, height: 30, borderRadius: 9,
            border: '1px solid transparent', background: 'transparent',
            color: 'var(--text-faint)', cursor: 'pointer', flexShrink: 0,
            transition: 'all var(--dur-fast) var(--ease-grow)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'var(--danger-soft)'
            el.style.color = 'var(--clay-400)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.background = 'transparent'
            el.style.color = 'var(--text-faint)'
          }}
          title="Delete project"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
          </svg>
        </button>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 16 }}>
        <div style={{ flex: 1, height: 7, borderRadius: 'var(--radius-pill)', background: 'var(--surface-3)', overflow: 'hidden' }}>
          <div style={{ height: '100%', width: donePct(project.done_count, project.task_count), background: project.color, borderRadius: 'var(--radius-pill)', transition: 'width 0.4s var(--ease-grow)' }} />
        </div>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-muted)', flexShrink: 0 }}>
          {project.task_count} tasks
        </span>
      </div>

      {/* Mark complete button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onComplete(project.id) }}
          style={{
            flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            padding: 8, borderRadius: 10,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-1)',
            color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
            transition: 'all var(--dur-fast) var(--ease-grow)',
          }}
          onMouseEnter={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = 'var(--accent)'
            el.style.color = 'var(--canopy-300)'
          }}
          onMouseLeave={(e) => {
            const el = e.currentTarget as HTMLButtonElement
            el.style.borderColor = 'var(--border-default)'
            el.style.color = 'var(--text-muted)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          Mark complete
        </button>
      </div>
    </div>
  )
}

// ---- Completed Project Row ------------------------------------------------

interface CompletedProjectRowProps {
  project: Project
  onReopen: (id: number) => void
  onDeleteClick: (p: Project) => void
  onNavigate: (id: number) => void
}

/**
 * CompletedProjectRow — compact row for completed projects.
 * Clicking the row body navigates to the project detail page.
 */
function CompletedProjectRow({ project, onReopen, onDeleteClick, onNavigate }: CompletedProjectRowProps) {
  return (
    <div
      onClick={() => onNavigate(project.id)}
      style={{
        position: 'relative', padding: '16px 18px', borderRadius: 18,
        background: 'var(--surface-1)',
        border: '1px solid var(--border-subtle)',
        cursor: 'pointer', opacity: 0.72,
        transition: 'opacity var(--dur-base) var(--ease-grow)',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.opacity = '1' }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = '0.72' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
          <span style={{ width: 11, height: 11, borderRadius: '50%', background: project.color, flexShrink: 0 }} />
          <div style={{ fontFamily: 'var(--font-body)', fontSize: 14.5, fontWeight: 600, color: 'var(--text-body)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {project.name}
          </div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em', color: 'var(--canopy-300)', flexShrink: 0 }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6 9 17l-5-5" />
          </svg>
          DONE
        </span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 13 }}>
        <button
          onClick={(e) => { e.stopPropagation(); onReopen(project.id) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 11px', borderRadius: 9,
            border: '1px solid var(--border-default)',
            background: 'transparent', color: 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reopen
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDeleteClick(project) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '6px 11px', borderRadius: 9,
            border: '1px solid transparent',
            background: 'transparent', color: 'var(--text-faint)',
            fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--clay-400)' }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-faint)' }}
        >
          Delete
        </button>
      </div>
    </div>
  )
}

// ---- Main Page ------------------------------------------------------------

/**
 * ProjectsPage — root component for the /projects route.
 */
export function ProjectsPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showNewModal, setShowNewModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchProjects()
      setProjects(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load projects')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const active = projects.filter((p) => !p.completed)
  const completed = projects.filter((p) => p.completed)

  async function handleComplete(id: number) {
    const p = projects.find((x) => x.id === id)
    if (!p) return
    try {
      const updated = await patchProject(id, { completed: !p.completed })
      setProjects((prev) => prev.map((x) => (x.id === id ? { ...x, ...updated } : x)))
    } catch {
      // silent — re-fetch on next interaction
    }
  }

  function handleCreated(p: Project) {
    setProjects((prev) => [p, ...prev])
    setShowNewModal(false)
  }

  function handleDeleted(id: number) {
    setProjects((prev) => prev.filter((x) => x.id !== id))
    setDeleteTarget(null)
  }

  return (
    <div
      className="grove-scroll"
      style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 40px' }}
    >
      {/* Section header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
          Active
        </span>
        <button
          onClick={() => setShowNewModal(true)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '9px 15px', borderRadius: 12,
            border: '1px solid var(--border-strong)',
            background: 'var(--surface-2)',
            color: 'var(--text-strong)',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 13, cursor: 'pointer',
          }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 5v14M5 12h14" />
          </svg>
          New project
        </button>
      </div>

      {/* Loading / error states */}
      {loading && (
        <div style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Loading projects…
        </div>
      )}
      {!loading && error && (
        <div style={{ color: 'var(--clay-400)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Active projects grid */}
      {!loading && !error && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16 }}>
          {active.length === 0 && (
            <div style={{ gridColumn: '1/-1', color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 13, padding: '24px 0' }}>
              No active projects — create one to get started.
            </div>
          )}
          {active.map((p) => (
            <ActiveProjectCard
              key={p.id}
              project={p}
              onComplete={handleComplete}
              onDeleteClick={setDeleteTarget}
              onNavigate={(id) => navigate(`/projects/${id}`)}
            />
          ))}
        </div>
      )}

      {/* Completed section */}
      {!loading && !error && completed.length > 0 && (
        <div style={{ marginTop: 30 }}>
          <span style={{ fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: 'var(--text-faint)' }}>
            Completed
          </span>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: 16, marginTop: 16 }}>
            {completed.map((p) => (
              <CompletedProjectRow
                key={p.id}
                project={p}
                onReopen={handleComplete}
                onDeleteClick={setDeleteTarget}
                onNavigate={(id) => navigate(`/projects/${id}`)}
              />
            ))}
          </div>
        </div>
      )}

      {/* Modals */}
      {showNewModal && (
        <NewProjectModal
          onClose={() => setShowNewModal(false)}
          onCreated={handleCreated}
        />
      )}
      {deleteTarget && (
        <DeleteConfirmModal
          project={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={handleDeleted}
        />
      )}
    </div>
  )
}
