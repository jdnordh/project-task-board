/**
 * ProjectDetailPage — /projects/:id route.
 *
 * Shows project metadata (name, color badge, billable indicator, completed status)
 * and a full task list for the project with no 72-hour cutoff — including done
 * tasks that have aged off the Board view.
 *
 * Task rows are clickable. Pass an `onTaskClick` prop (wired in TASK-005) to
 * open the Task Drawer in edit mode.
 */

import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'

// ---- Types ------------------------------------------------------------------

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

interface Task {
  id: number
  project_id: number
  name: string
  priority: 1 | 2 | 3 | 4
  notes: string | null
  status: string
  done_at: string | null
  manual_adjustment_minutes: number
  created_at: string
  updated_at: string
  project_name: string
  project_color: string
  latest_blocked_reason?: string | null
}

// ---- Constants --------------------------------------------------------------

/** Priority display labels and colors — mirrors BoardPage. */
const PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: '#f0876a' },
  2: { label: 'High', color: '#f5c542' },
  3: { label: 'Medium', color: '#45d3bb' },
  4: { label: 'Low', color: '#74897b' },
}

/** Status display labels and colors. */
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  backlog:     { label: 'Backlog',     color: '#74897b' },
  ready:       { label: 'Ready',       color: '#45d3bb' },
  in_progress: { label: 'In Progress', color: '#4ade80' },
  blocked:     { label: 'Blocked',     color: '#f0876a' },
  done:        { label: 'Done',        color: '#86efac' },
}

// ---- API helpers ------------------------------------------------------------

/**
 * Fetches a single project by id.
 */
async function fetchProject(id: number): Promise<Project> {
  const res = await fetch(`/api/projects/${id}`)
  if (!res.ok) {
    if (res.status === 404) throw new Error('Project not found')
    throw new Error('Failed to load project')
  }
  return res.json()
}

/**
 * Fetches ALL tasks for a project (no 72h filter) using the singular ?projectId= param.
 */
async function fetchProjectTasks(projectId: number): Promise<Task[]> {
  const res = await fetch(`/api/tasks?projectId=${projectId}`)
  if (!res.ok) throw new Error('Failed to load tasks')
  return res.json()
}

// ---- TaskRow ----------------------------------------------------------------

interface TaskRowProps {
  task: Task
  /** Called when the row is clicked. Wire to TaskDrawer in TASK-005. */
  onTaskClick?: (task: Task) => void
}

/**
 * TaskRow — a single task row in the project detail list.
 * Matches the visual language of the Board's TaskCard: color left-border,
 * project color dot, priority badge, status pill.
 */
function TaskRow({ task, onTaskClick }: TaskRowProps) {
  const pri = PRIORITY_MAP[task.priority] ?? PRIORITY_MAP[2]
  const st = STATUS_MAP[task.status] ?? { label: task.status, color: '#74897b' }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onTaskClick?.(task)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') onTaskClick?.(task) }}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '12px 16px',
        borderRadius: 14,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${task.project_color}`,
        boxShadow: 'var(--shadow-sm), var(--ring-inset)',
        cursor: onTaskClick ? 'pointer' : 'default',
        transition: 'transform var(--dur-fast) var(--ease-grow), box-shadow var(--dur-base) var(--ease-grow), border-color var(--dur-base) var(--ease-grow)',
      }}
      onMouseEnter={(e) => {
        if (!onTaskClick) return
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = 'var(--glow-accent), var(--ring-inset)'
        el.style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={(e) => {
        if (!onTaskClick) return
        const el = e.currentTarget as HTMLElement
        el.style.transform = ''
        el.style.boxShadow = 'var(--shadow-sm), var(--ring-inset)'
        el.style.borderColor = 'var(--border-default)'
      }}
    >
      {/* Task name — flex grow */}
      <span style={{
        flex: 1, minWidth: 0,
        fontFamily: 'var(--font-body)', fontSize: 14, fontWeight: 600,
        color: task.status === 'done' ? 'var(--text-muted)' : 'var(--text-strong)',
        textDecoration: task.status === 'done' ? 'line-through' : 'none',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>
        {task.name}
      </span>

      {/* Status pill */}
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        padding: '3px 9px', borderRadius: 'var(--radius-pill)',
        background: st.color + '18',
        fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em',
        color: st.color, flexShrink: 0,
      }}>
        {st.label}
      </span>

      {/* Priority badge */}
      <span
        title={pri.label}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '2px 8px 2px 6px',
          borderRadius: 'var(--radius-pill)',
          background: 'rgba(255,255,255,0.04)',
          flexShrink: 0,
        }}
      >
        <svg
          width="11" height="11" viewBox="0 0 24 24"
          fill={pri.color} stroke={pri.color}
          strokeWidth="1.5" strokeLinejoin="round"
        >
          <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
        </svg>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em', color: pri.color }}>
          {pri.label}
        </span>
      </span>

      {/* Chevron hint — only rendered if clickable */}
      {onTaskClick && (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--text-faint)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
          <path d="M9 18l6-6-6-6" />
        </svg>
      )}
    </div>
  )
}

// ---- Main page --------------------------------------------------------------

interface ProjectDetailPageProps {
  /**
   * Optional callback for when a task row is clicked.
   * Wire this to the Task Drawer (TASK-005) in App.tsx to open in edit mode.
   */
  onTaskClick?: (task: Task) => void
}

/**
 * ProjectDetailPage — shows project metadata and a full, unfiltered task list.
 * No 72-hour cutoff: done tasks that have aged off the Board appear here.
 */
export function ProjectDetailPage({ onTaskClick }: ProjectDetailPageProps) {
  const { id } = useParams<{ id: string }>()
  const projectId = Number(id)

  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [proj, taskList] = await Promise.all([
        fetchProject(projectId),
        fetchProjectTasks(projectId),
      ])
      setProject(proj)
      setTasks(taskList)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [projectId])

  useEffect(() => { load() }, [load])

  // Group tasks by status for display order
  const STATUS_ORDER = ['in_progress', 'blocked', 'ready', 'backlog', 'done']
  const tasksByStatus = STATUS_ORDER.reduce<Record<string, Task[]>>((acc, s) => {
    acc[s] = tasks.filter((t) => t.status === s)
    return acc
  }, {})

  // Color helper — translucent version for backgrounds
  function colorSoft(hex: string, opacity = '22'): string {
    return hex + opacity
  }

  return (
    <div className="grove-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 28px 40px' }}>

      {/* Back link */}
      <Link
        to="/projects"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          marginBottom: 20,
          fontFamily: 'var(--font-body)', fontSize: 13, fontWeight: 600,
          color: 'var(--text-muted)',
          textDecoration: 'none',
        }}
        onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-body)' }}
        onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 18l-6-6 6-6" />
        </svg>
        Back to Projects
      </Link>

      {/* Loading state */}
      {loading && (
        <div style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          Loading…
        </div>
      )}

      {/* Error state */}
      {!loading && error && (
        <div style={{ color: 'var(--clay-400)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {/* Project header */}
      {!loading && !error && project && (
        <>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 14,
            padding: '18px 20px',
            borderRadius: 18,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-default)',
            borderTop: `3px solid ${project.color}`,
            boxShadow: 'var(--shadow-md), var(--ring-inset)',
            marginBottom: 24,
          }}>
            {/* Color icon */}
            <span style={{
              width: 42, height: 42, borderRadius: 13,
              background: colorSoft(project.color),
              border: `1px solid ${project.color}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={project.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 22V8M9 5c0-2 1.2-3 3-3s3 1 3 3" />
                <path d="M8 13c-2.5 0-4-1.5-4-4 2.5 0 4 1.5 4 4ZM16 13c2.5 0 4-1.5 4-4-2.5 0-4 1.5-4 4Z" />
              </svg>
            </span>

            {/* Name + badges */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{
                fontFamily: 'var(--font-display)', fontStretch: '125%',
                fontSize: 22, fontWeight: 800,
                color: 'var(--text-strong)', letterSpacing: '-0.02em',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {project.name}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 5 }}>
                {/* Color dot */}
                <span style={{
                  width: 9, height: 9, borderRadius: '50%',
                  background: project.color, flexShrink: 0,
                }} />

                {/* Billable badge */}
                {project.billable && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(234,179,8,0.12)',
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em',
                    color: 'var(--sun-300)',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M14.5 9.2a2.4 2.4 0 0 0-2.5-1.7c-1.3 0-2.4.8-2.4 2 0 2.6 4.8 1.6 4.8 4 0 1.2-1.1 2-2.4 2a2.4 2.4 0 0 1-2.5-1.7M12 6v1.5M12 16.5V18" />
                    </svg>
                    BILLABLE
                  </span>
                )}

                {/* Completed badge */}
                {project.completed && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    padding: '2px 8px', borderRadius: 'var(--radius-pill)',
                    background: 'rgba(134,239,172,0.1)',
                    fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '0.04em',
                    color: '#86efac',
                  }}>
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20 6 9 17l-5-5" />
                    </svg>
                    COMPLETED
                  </span>
                )}

                {/* Task count */}
                <span style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--text-faint)',
                }}>
                  {project.task_count} {project.task_count === 1 ? 'task' : 'tasks'}
                </span>
              </div>
            </div>
          </div>

          {/* Task list — grouped by status */}
          {tasks.length === 0 ? (
            <div style={{ color: 'var(--text-faint)', fontFamily: 'var(--font-body)', fontSize: 13, padding: '12px 0' }}>
              No tasks yet for this project.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {STATUS_ORDER.map((statusKey) => {
                const group = tasksByStatus[statusKey]
                if (!group || group.length === 0) return null
                const st = STATUS_MAP[statusKey]
                return (
                  <div key={statusKey}>
                    {/* Group header */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      marginBottom: 10,
                    }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: st.color, flexShrink: 0,
                      }} />
                      <span style={{
                        fontFamily: 'var(--font-body)', fontSize: 11, fontWeight: 700,
                        letterSpacing: '0.14em', textTransform: 'uppercase',
                        color: 'var(--text-faint)',
                      }}>
                        {st.label}
                      </span>
                      <span style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10.5,
                        color: 'var(--text-faint)',
                      }}>
                        ({group.length})
                      </span>
                    </div>

                    {/* Task rows */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {group.map((task) => (
                        <TaskRow
                          key={task.id}
                          task={task}
                          onTaskClick={onTaskClick}
                        />
                      ))}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}
