/**
 * ProjectDrawer — slide-in panel from the right for editing a project's name and color.
 *
 * Always opens in edit mode (projectId required). Simpler than TaskDrawer:
 * no subtasks, no time tracking, no project picker.
 *
 * Behaviours:
 * - Slides in from right via .grove-drawer CSS animation.
 * - Clicking the backdrop closes the drawer; if isDirty, shows confirm-discard modal.
 * - Saves via PATCH /api/projects/:id with { name, color }.
 * - On success: calls onSaved() then onClose().
 */

import { useState, useEffect, useRef } from 'react'
import { PROJECT_COLORS } from '../pages/ProjectsPage'

// ---- Types ------------------------------------------------------------------

export interface ProjectDrawerProps {
  /** The project id to edit */
  projectId: number
  /** Called after a successful save so the projects list can re-fetch */
  onSaved: () => void
  /** Called to close the drawer */
  onClose: () => void
}

interface DrawerDraft {
  name: string
  color: string
}

// ---- Shared label style (same tokens as TaskDrawer) ------------------------

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

// ---- ConfirmModal -----------------------------------------------------------

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
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4M12 17h.01" />
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

// ---- ProjectDrawer (main) --------------------------------------------------

/**
 * ProjectDrawer — slide-in panel for editing a project's name and color.
 */
export function ProjectDrawer({ projectId, onSaved, onClose }: ProjectDrawerProps) {
  const [draft, setDraft] = useState<DrawerDraft>({ name: '', color: PROJECT_COLORS[0] })
  const [baseline, setBaseline] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [showDiscardModal, setShowDiscardModal] = useState(false)

  const nameInputRef = useRef<HTMLInputElement>(null)

  // ---- Load project data ---------------------------------------------------

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      try {
        const res = await fetch(`/api/projects/${projectId}`)
        if (!res.ok) throw new Error('Failed to load project')
        const data = await res.json()
        const d: DrawerDraft = { name: data.name, color: data.color }
        if (!cancelled) {
          setDraft(d)
          setBaseline(JSON.stringify(d))
          setLoading(false)
          setTimeout(() => nameInputRef.current?.focus(), 60)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load project')
          setLoading(false)
        }
      }
    }
    load()
    return () => { cancelled = true }
  }, [projectId])

  // ---- Derived state -------------------------------------------------------

  const isDirty = JSON.stringify(draft) !== baseline

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

  // ---- Draft updater -------------------------------------------------------

  function patchDraft(patch: Partial<DrawerDraft>) {
    setDraft((prev) => ({ ...prev, ...patch }))
  }

  // ---- Save ----------------------------------------------------------------

  async function handleSave() {
    if (!draft.name.trim()) {
      setError('Project name is required.')
      nameInputRef.current?.focus()
      return
    }
    setError(null)
    setSaving(true)
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: draft.name.trim(), color: draft.color }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.errors?.join(', ') ?? 'Failed to update project')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed')
      setSaving(false)
    }
  }

  // ---- Render --------------------------------------------------------------

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
        {/* Panel */}
        <div
          className="grove-drawer"
          onClick={(e) => e.stopPropagation()}
          style={{
            width: 400, maxWidth: '92vw', height: '100%',
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
              Edit project
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

              {/* Project name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={labelStyle}>Project name</label>
                <input
                  ref={nameInputRef}
                  value={draft.name}
                  onChange={(e) => patchDraft({ name: e.target.value })}
                  placeholder="What are you working on?"
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

              {/* Color picker */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <label style={labelStyle}>Color</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {PROJECT_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => patchDraft({ color: c })}
                      title={c}
                      style={{
                        width: 28, height: 28, borderRadius: 8,
                        background: c,
                        border: draft.color === c ? '2px solid var(--text-strong)' : '2px solid transparent',
                        outline: draft.color === c ? '2px solid ' + c : 'none',
                        outlineOffset: 2,
                        cursor: 'pointer',
                        boxShadow: draft.color === c ? '0 0 0 3px rgba(255,255,255,0.2)' : undefined,
                      }}
                      aria-label={`Select color ${c}`}
                      aria-pressed={draft.color === c}
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Footer */}
          <div style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '16px 22px',
            borderTop: '1px solid var(--border-default)',
          }}>
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
              {saving ? 'Saving…' : 'Save changes'}
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
    </>
  )
}
