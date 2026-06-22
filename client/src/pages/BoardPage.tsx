/**
 * BoardPage — the main Kanban board view at `/`.
 *
 * Renders 5 columns (Backlog, Ready, In Progress, Blocked, Done),
 * supports drag-and-drop between columns via dnd-kit, filter pills
 * per active project, and a collapsible Backlog column with cookie-
 * persisted state.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { useDraggable, useDroppable } from '@dnd-kit/core'

// ---- Types ----------------------------------------------------------------

export interface Task {
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
}

interface Project {
  id: number
  name: string
  color: string
  billable: boolean
  completed: boolean
}

// ---- Constants ------------------------------------------------------------

/** Column definitions — order matches prototype. */
const COLUMNS = [
  {
    key: 'backlog',
    label: 'Backlog',
    accent: '#74897b',
    headBg: 'var(--surface-1)',
    emptyText: 'Nothing queued — add a task to get started.',
    isBacklog: true,
  },
  {
    key: 'ready',
    label: 'Ready',
    accent: '#45d3bb',
    headBg: 'var(--surface-1)',
    emptyText: 'No tasks are ready — move one from Backlog.',
    isBacklog: false,
  },
  {
    key: 'in_progress',
    label: 'In Progress',
    accent: '#4ade80',
    headBg: 'rgba(74,222,128,0.04)',
    emptyText: 'Nothing in flight right now.',
    isBacklog: false,
  },
  {
    key: 'blocked',
    label: 'Blocked',
    accent: '#f0876a',
    headBg: 'rgba(240,135,106,0.05)',
    emptyText: 'No blockers — keep it that way.',
    isBacklog: false,
  },
  {
    key: 'done',
    label: 'Done',
    accent: '#86efac',
    headBg: 'rgba(134,239,172,0.04)',
    emptyText: 'No tasks completed in the last 72 hours.',
    isBacklog: false,
  },
] as const

type ColumnKey = (typeof COLUMNS)[number]['key']

/** Priority display mapping — from prototype data definitions. */
const PRIORITY_MAP: Record<number, { label: string; color: string }> = {
  1: { label: 'Critical', color: '#f0876a' },
  2: { label: 'High', color: '#f5c542' },
  3: { label: 'Medium', color: '#45d3bb' },
  4: { label: 'Low', color: '#74897b' },
}

/** 72-hour cutoff for Done column. */
const DONE_CUTOFF_MS = 72 * 60 * 60 * 1000

// ---- Cookie helpers -------------------------------------------------------

/**
 * Reads a cookie value by name. Returns null if absent.
 */
function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'))
  return match ? decodeURIComponent(match[1]) : null
}

/**
 * Sets a cookie with a 1-year expiry.
 */
function setCookie(name: string, value: string): void {
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString()
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/`
}

// ---- API helpers ----------------------------------------------------------

async function fetchTasks(projectIds?: number[]): Promise<Task[]> {
  const url =
    projectIds && projectIds.length > 0
      ? `/api/tasks?projectIds=${projectIds.join(',')}`
      : '/api/tasks'
  const res = await fetch(url)
  if (!res.ok) throw new Error('Failed to load tasks')
  return res.json()
}

async function fetchProjects(): Promise<Project[]> {
  const res = await fetch('/api/projects')
  if (!res.ok) throw new Error('Failed to load projects')
  return res.json()
}

async function patchTaskStatus(id: number, status: string): Promise<Task> {
  const res = await fetch(`/api/tasks/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  })
  if (!res.ok) throw new Error('Failed to update task')
  return res.json()
}

// ---- TaskCard component ---------------------------------------------------

interface TaskCardProps {
  task: Task
  isDragging?: boolean
}

/**
 * TaskCard — renders a single task card matching the Grove prototype design.
 * Shows task name, priority badge, and project color dot/left-border.
 */
function TaskCard({ task, isDragging = false }: TaskCardProps) {
  const pri = PRIORITY_MAP[task.priority] ?? PRIORITY_MAP[2]

  return (
    <div
      style={{
        position: 'relative',
        padding: '13px 14px',
        borderRadius: 14,
        background: 'var(--surface-card)',
        border: '1px solid var(--border-default)',
        borderLeft: `3px solid ${task.project_color}`,
        boxShadow: isDragging
          ? 'var(--glow-accent), var(--ring-inset)'
          : 'var(--shadow-sm), var(--ring-inset)',
        cursor: isDragging ? 'grabbing' : 'grab',
        transform: isDragging ? 'rotate(1.5deg) scale(1.03)' : undefined,
        opacity: isDragging ? 0.95 : 1,
        transition: isDragging
          ? undefined
          : 'transform var(--dur-fast) var(--ease-grow), box-shadow var(--dur-base) var(--ease-grow), border-color var(--dur-base) var(--ease-grow)',
      }}
      onMouseEnter={(e) => {
        if (isDragging) return
        const el = e.currentTarget as HTMLElement
        el.style.transform = 'translateY(-2px)'
        el.style.boxShadow = 'var(--glow-accent), var(--ring-inset)'
        el.style.borderColor = 'var(--border-strong)'
      }}
      onMouseLeave={(e) => {
        if (isDragging) return
        const el = e.currentTarget as HTMLElement
        el.style.transform = ''
        el.style.boxShadow = 'var(--shadow-sm), var(--ring-inset)'
        el.style.borderColor = 'var(--border-default)'
      }}
    >
      {/* Top row: project name + priority badge */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 9 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
          <span
            style={{
              width: 7, height: 7, borderRadius: '50%',
              background: task.project_color,
              flexShrink: 0,
            }}
          />
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10.5,
              letterSpacing: '0.02em',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {task.project_name}
          </span>
        </span>

        {/* Priority badge */}
        <span
          title={pri.label}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '2px 8px 2px 6px',
            borderRadius: 'var(--radius-pill)',
            background: 'rgba(255,255,255,0.04)',
            flexShrink: 0,
          }}
        >
          {/* Leaf icon — matches prototype */}
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill={pri.color}
            stroke={pri.color}
            strokeWidth="1.5"
            strokeLinejoin="round"
          >
            <path
              d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
              opacity="0.9"
            />
          </svg>
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontSize: 10.5,
              fontWeight: 700,
              color: pri.color,
            }}
          >
            {pri.label}
          </span>
        </span>
      </div>

      {/* Task name */}
      <div
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 14,
          fontWeight: 600,
          lineHeight: 1.35,
          color: 'var(--text-strong)',
        }}
      >
        {task.name}
      </div>
    </div>
  )
}

// ---- DraggableTaskCard ----------------------------------------------------

interface DraggableTaskCardProps {
  task: Task
}

/**
 * DraggableTaskCard — wraps TaskCard with dnd-kit's useDraggable hook.
 */
function DraggableTaskCard({ task }: DraggableTaskCardProps) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: `task-${task.id}`,
    data: { task },
  })

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{ touchAction: 'none' }}
      className="grove-card"
    >
      <TaskCard task={task} isDragging={isDragging} />
    </div>
  )
}

// ---- DroppableColumn ------------------------------------------------------

interface DroppableColumnProps {
  columnKey: ColumnKey
  tasks: Task[]
  isOver: boolean
  children: React.ReactNode
}

/**
 * DroppableColumn — the inner scrollable area of a board column that accepts
 * dropped task cards.
 */
function DroppableColumn({ columnKey, isOver, children }: DroppableColumnProps) {
  const { setNodeRef } = useDroppable({ id: columnKey })

  return (
    <div
      ref={setNodeRef}
      className="grove-scroll"
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        padding: '6px 12px 14px',
        overflowY: 'auto',
        minHeight: 80,
        borderRadius: '0 0 18px 18px',
        background: isOver ? 'rgba(74,222,128,0.06)' : undefined,
        transition: 'background var(--dur-fast) var(--ease-grow)',
      }}
    >
      {children}
    </div>
  )
}

// ---- BoardColumn ----------------------------------------------------------

interface BoardColumnProps {
  col: (typeof COLUMNS)[number]
  tasks: Task[]
  collapsed?: boolean
  overColumnKey: string | null
  onToggleCollapse?: () => void
}

/**
 * BoardColumn — full column including header and droppable card area.
 */
function BoardColumn({ col, tasks, collapsed = false, overColumnKey, onToggleCollapse }: BoardColumnProps) {
  const isOver = overColumnKey === col.key

  if (collapsed) {
    return (
      <div style={{ flexShrink: 0, width: 48, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
        <button
          onClick={onToggleCollapse}
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 14,
            padding: '16px 0',
            borderRadius: 18,
            border: '1px solid var(--border-default)',
            background: 'var(--surface-1)',
            color: 'var(--text-muted)',
            cursor: 'pointer',
          }}
        >
          {/* Right-pointing chevron */}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
          <span
            style={{
              writingMode: 'vertical-rl',
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 13,
              letterSpacing: '0.04em',
              color: 'var(--text-body)',
            }}
          >
            {col.label}
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 12,
              padding: '3px 7px',
              borderRadius: 8,
              background: 'var(--surface-3)',
              color: 'var(--text-muted)',
            }}
          >
            {tasks.length}
          </span>
        </button>
      </div>
    )
  }

  return (
    <div style={{ flexShrink: 0, width: 280, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          borderRadius: 18,
          background: col.headBg,
          border: `1px solid ${isOver ? 'rgba(74,222,128,0.35)' : 'var(--border-default)'}`,
          transition: 'border-color var(--dur-fast) var(--ease-grow)',
        }}
      >
        {/* Column header */}
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 9, padding: '14px 14px 11px' }}>
          {col.isBacklog && onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 22,
                height: 22,
                borderRadius: 7,
                border: 'none',
                background: 'transparent',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              title="Collapse Backlog"
            >
              {/* Down-pointing chevron */}
              <svg
                width="15"
                height="15"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          )}

          {/* Accent dot */}
          <span
            style={{
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: col.accent,
              boxShadow: `0 0 9px ${col.accent}`,
            }}
          />

          {/* Label */}
          <span
            style={{
              fontFamily: 'var(--font-body)',
              fontWeight: 700,
              fontSize: 13.5,
              letterSpacing: '0.03em',
              color: 'var(--text-strong)',
            }}
          >
            {col.label}
          </span>

          {/* Count badge */}
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11.5,
              padding: '2px 7px',
              borderRadius: 7,
              background: 'var(--surface-3)',
              color: 'var(--text-muted)',
            }}
          >
            {tasks.length}
          </span>
        </div>

        {/* Droppable card area */}
        <DroppableColumn columnKey={col.key} tasks={tasks} isOver={isOver}>
          {tasks.map((task) => (
            <DraggableTaskCard key={task.id} task={task} />
          ))}

          {tasks.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '26px 12px',
                color: 'var(--text-faint)',
                textAlign: 'center',
              }}
            >
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ opacity: 0.5 }}
              >
                <path d="M7 20h10M12 20V10M12 10c0-3 2-5 5-5 0 3-2 5-5 5ZM12 12c0-3-2-5-5-5 0 3 2 5 5 5Z" />
              </svg>
              <span style={{ fontSize: 12 }}>{col.emptyText}</span>
            </div>
          )}
        </DroppableColumn>
      </div>
    </div>
  )
}

// ---- FilterPills ----------------------------------------------------------

interface FilterPillsProps {
  projects: Project[]
  selected: number[]
  onToggle: (id: number) => void
  onClear: () => void
}

/**
 * FilterPills — renders one pill per non-completed project.
 * Multi-select with OR logic; no selection = show all.
 */
function FilterPills({ projects, selected, onToggle, onClear }: FilterPillsProps) {
  const active = projects.filter((p) => !p.completed)

  return (
    <div
      style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '16px 28px 14px',
        flexWrap: 'wrap',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-body)',
          fontSize: 11,
          fontWeight: 700,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color: 'var(--text-faint)',
          marginRight: 2,
        }}
      >
        Filter
      </span>

      {active.map((proj) => {
        const isActive = selected.includes(proj.id)
        return (
          <button
            key={proj.id}
            onClick={() => onToggle(proj.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 7,
              padding: '6px 13px 6px 11px',
              borderRadius: 'var(--radius-pill)',
              border: `1px solid ${isActive ? proj.color + '55' : 'var(--border-default)'}`,
              background: isActive ? proj.color + '18' : 'transparent',
              color: isActive ? 'var(--text-strong)' : 'var(--text-muted)',
              fontFamily: 'var(--font-body)',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all var(--dur-fast) var(--ease-grow)',
            }}
          >
            <span
              style={{
                width: 9,
                height: 9,
                borderRadius: '50%',
                background: proj.color,
                boxShadow: isActive ? `0 0 0 3px ${proj.color}22` : undefined,
              }}
            />
            {proj.name}
          </button>
        )
      })}

      {selected.length > 0 && (
        <button
          onClick={onClear}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 11px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid transparent',
            background: 'transparent',
            color: 'var(--text-faint)',
            fontFamily: 'var(--font-body)',
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          <svg
            width="13"
            height="13"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M18 6 6 18M6 6l12 12" />
          </svg>
          Clear
        </button>
      )}
    </div>
  )
}

// ---- BoardPage (main) -----------------------------------------------------

/**
 * BoardPage — root component for the `/` board route.
 *
 * Manages:
 * - Task + project data fetching
 * - Filter pill selection state
 * - Backlog collapsed/expanded state (cookie-persisted)
 * - dnd-kit drag-and-drop with optimistic task status updates
 */
export function BoardPage() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedProjectIds, setSelectedProjectIds] = useState<number[]>([])
  const [backlogExpanded, setBacklogExpanded] = useState<boolean>(() => {
    const saved = getCookie('backlog_expanded')
    return saved === null ? true : saved === 'true'
  })
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null)
  const [overColumnKey, setOverColumnKey] = useState<string | null>(null)

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 6 },
    })
  )

  // ---- Data loading -------------------------------------------------------

  const loadTasks = useCallback(async (projectIds: number[]) => {
    try {
      const data = await fetchTasks(projectIds.length > 0 ? projectIds : undefined)
      setTasks(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tasks')
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    async function init() {
      setLoading(true)
      setError(null)
      try {
        const [fetchedProjects, fetchedTasks] = await Promise.all([
          fetchProjects(),
          fetchTasks(),
        ])
        if (!cancelled) {
          setProjects(fetchedProjects)
          setTasks(fetchedTasks)
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load board')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()
    return () => { cancelled = true }
  }, [])

  // Reload tasks whenever filter changes (after initial load)
  const isInitialMount = useRef(true)
  useEffect(() => {
    if (isInitialMount.current) {
      // skip — initial load already handles this
      isInitialMount.current = false
      return
    }
    loadTasks(selectedProjectIds)
  }, [selectedProjectIds, loadTasks])

  // ---- Filter pill handlers -----------------------------------------------

  function handleToggleFilter(id: number) {
    setSelectedProjectIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    )
  }

  function handleClearFilter() {
    setSelectedProjectIds([])
  }

  // ---- Backlog collapse ---------------------------------------------------

  function handleToggleBacklog() {
    setBacklogExpanded((prev) => {
      const next = !prev
      setCookie('backlog_expanded', String(next))
      return next
    })
  }

  // ---- Task grouping ------------------------------------------------------

  const cutoff = Date.now() - DONE_CUTOFF_MS

  function getColumnTasks(key: string): Task[] {
    let filtered: Task[]
    if (key === 'done') {
      filtered = tasks.filter(
        (t) => t.status === 'done' && t.done_at != null && new Date(t.done_at).getTime() > cutoff
      )
    } else {
      filtered = tasks.filter((t) => t.status === key)
    }
    return filtered.slice().sort((a, b) => a.priority - b.priority)
  }

  // ---- Drag-and-drop handlers ---------------------------------------------

  function handleDragStart(event: DragStartEvent) {
    const task = event.active.data.current?.task as Task | undefined
    if (task) setActiveDragTask(task)
  }

  function handleDragOver(event: { over: { id: string | number } | null }) {
    const overId = event.over?.id as string | undefined
    const col = COLUMNS.find((c) => c.key === overId)
    setOverColumnKey(col ? col.key : null)
  }

  function handleDragEnd(event: DragEndEvent) {
    setActiveDragTask(null)
    setOverColumnKey(null)

    const { active, over } = event
    if (!over) return

    const task = active.data.current?.task as Task | undefined
    if (!task) return

    const newStatus = over.id as string
    if (!COLUMNS.find((c) => c.key === newStatus)) return
    if (task.status === newStatus) return

    // Optimistic update
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: newStatus, done_at: newStatus === 'done' ? new Date().toISOString() : null }
          : t
      )
    )

    // Persist to server; revert on failure
    patchTaskStatus(task.id, newStatus).catch(() => {
      setTasks((prev) =>
        prev.map((t) => (t.id === task.id ? { ...t, status: task.status, done_at: task.done_at } : t))
      )
    })
  }

  // ---- Render -------------------------------------------------------------

  if (loading) {
    return (
      <div
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-faint)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
        }}
      >
        Loading board…
      </div>
    )
  }

  if (error) {
    return (
      <div
        style={{
          flex: 1,
          padding: 32,
          color: 'var(--clay-400)',
          fontFamily: 'var(--font-mono)',
          fontSize: 13,
        }}
      >
        {error}
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Filter pills */}
      <FilterPills
        projects={projects}
        selected={selectedProjectIds}
        onToggle={handleToggleFilter}
        onClear={handleClearFilter}
      />

      {/* Board columns */}
      <DndContext
        sensors={sensors}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver as any}
        onDragEnd={handleDragEnd}
      >
        <div
          className="grove-scroll"
          style={{
            flex: 1,
            display: 'flex',
            gap: 16,
            padding: '4px 28px 26px',
            overflowX: 'auto',
            overflowY: 'hidden',
            alignItems: 'stretch',
          }}
        >
          {COLUMNS.map((col) => (
            <BoardColumn
              key={col.key}
              col={col}
              tasks={getColumnTasks(col.key)}
              collapsed={col.isBacklog && !backlogExpanded}
              overColumnKey={overColumnKey}
              onToggleCollapse={col.isBacklog ? handleToggleBacklog : undefined}
            />
          ))}
        </div>

        {/* Drag overlay — renders a floating copy of the dragged card */}
        <DragOverlay>
          {activeDragTask ? <TaskCard task={activeDragTask} isDragging /> : null}
        </DragOverlay>
      </DndContext>
    </div>
  )
}
