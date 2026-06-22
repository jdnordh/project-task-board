/**
 * BlockedReasonModal — modal dialog that captures a required reason
 * before a task is moved into the Blocked column.
 *
 * Design matches the Grove Board prototype (Grove Board.dc.html lines 434–455).
 * Shows the task name as a subtitle; requires non-empty reason text before
 * "Move to blocked" is enabled.
 */

import { useState, useEffect, useRef } from 'react'

interface BlockedReasonModalProps {
  /** The name of the task being blocked — shown as a subtitle. */
  taskName: string
  /** Called with the trimmed reason string when the user confirms. */
  onConfirm: (reason: string) => void
  /** Called when the user cancels — drag should be fully reverted. */
  onCancel: () => void
}

/**
 * BlockedReasonModal — modal that intercepts a drag-to-blocked action and
 * requires the user to enter a reason before the task can move.
 */
export function BlockedReasonModal({ taskName, onConfirm, onCancel }: BlockedReasonModalProps) {
  const [reason, setReason] = useState('')
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // Focus the textarea when the modal opens.
  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  const isReady = reason.trim().length > 0

  function handleConfirm() {
    if (!isReady) return
    onConfirm(reason.trim())
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onCancel()
    }
  }

  return (
    /* Backdrop */
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
        background: 'rgba(4,8,6,0.66)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
      }}
      onKeyDown={handleKeyDown}
    >
      {/* Panel */}
      <div
        className="grove-overlay"
        style={{
          width: 420,
          maxWidth: '100%',
          padding: 24,
          borderRadius: 20,
          background: 'var(--surface-1)',
          border: '1px solid var(--border-strong)',
          boxShadow: 'var(--shadow-xl)',
        }}
      >
        {/* Header row: icon + title + task name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 6 }}>
          {/* Warning icon badge */}
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 11,
              background: 'var(--danger-soft)',
              border: '1px solid var(--danger)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              width="19"
              height="19"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--clay-400)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="m21.73 18-8-14a2 2 0 0 0-3.46 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          </span>

          <div>
            <div
              style={{
                fontFamily: 'var(--font-display)',
                fontStretch: '125%',
                fontSize: 18,
                fontWeight: 800,
                color: 'var(--text-strong)',
              }}
            >
              Why is this blocked?
            </div>
            <div
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: 11.5,
                color: 'var(--text-muted)',
                marginTop: 2,
              }}
            >
              {taskName}
            </div>
          </div>
        </div>

        {/* Helper text */}
        <p
          style={{
            fontSize: 13,
            color: 'var(--text-muted)',
            lineHeight: 1.5,
            margin: '8px 0 14px',
          }}
        >
          A reason is required to move this into Blocked. It&apos;s saved to the task&apos;s history.
        </p>

        {/* Reason textarea */}
        <textarea
          ref={textareaRef}
          value={reason}
          onChange={(e) => setReason(e.currentTarget.value)}
          placeholder="Waiting on…"
          style={{
            width: '100%',
            minHeight: 80,
            padding: '11px 13px',
            borderRadius: 11,
            background: 'var(--bg-sunken)',
            border: '1px solid var(--border-default)',
            color: 'var(--text-strong)',
            fontFamily: 'var(--font-body)',
            fontSize: 13.5,
            lineHeight: 1.5,
            resize: 'vertical',
            outline: 'none',
            boxSizing: 'border-box',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'var(--accent)'
            e.currentTarget.style.boxShadow = 'var(--glow-focus)'
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = 'var(--border-default)'
            e.currentTarget.style.boxShadow = ''
          }}
        />

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 11,
              border: '1px solid var(--border-strong)',
              background: 'var(--surface-2)',
              color: 'var(--text-strong)',
              fontFamily: 'var(--font-body)',
              fontWeight: 600,
              fontSize: 13.5,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!isReady}
            style={{
              flex: 1,
              padding: 11,
              borderRadius: 11,
              border: '1px solid var(--danger)',
              background: isReady ? 'var(--danger-soft)' : 'var(--surface-2)',
              color: isReady ? 'var(--clay-400)' : 'var(--text-faint)',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 13.5,
              cursor: isReady ? 'pointer' : 'not-allowed',
            }}
          >
            Move to blocked
          </button>
        </div>
      </div>
    </div>
  )
}
