/** Shapes the API returns. */

export type ColumnId = 'backlog' | 'week' | 'progress' | 'claude' | 'blocked' | 'done'
export type AgentState = 'running' | 'question' | 'review' | 'complete'
export type ModelId = 'opus' | 'sonnet' | 'fable'
export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export interface Subtask {
  t: string
  done: boolean
}

export interface Feature {
  id: string
  name: string
  color: string
  sort_order: number
  completed: boolean
  skin: string | null
  claude_model: ModelId | null
  claude_effort: Effort | null
  repo_path: string | null
}

export interface TaskFile {
  id: string
  kind: string
  title: string
  path: string
  url: string
}

export interface Task {
  id: string
  title: string
  feature: string
  priority: number
  est: number
  due: string | null
  status: ColumnId
  desc: string
  desc_html: string
  subtasks: Subtask[]
  sort_order: number
  created_at: string | null
  started_at: string | null
  completed_at: string | null
  agent_state: AgentState | null
  agent_note: string
  agent_at: string | null
  agent_report: string
  claude_model: ModelId | null
  claude_effort: Effort | null
  repo_path: string | null
  files: TaskFile[]
}

/** A task being edited in the drawer. `_new` marks a task not yet created. */
export type Draft = Omit<Task, 'id' | 'sort_order' | 'created_at' | 'started_at' | 'completed_at' | 'agent_at' | 'agent_report' | 'files' | 'agent_state' | 'agent_note'> & {
  id?: string
  _new?: boolean
  agent_state?: AgentState | null
  agent_note?: string
}

export type DueRule = { kind: 'today' } | { kind: 'eow' } | { kind: 'days'; n: number }

export interface TemplateFields {
  title?: string
  feature?: string
  status?: ColumnId
  priority?: number
  est?: number
  due?: DueRule
  desc_html?: string
  subtasks?: Subtask[]
  claude_model?: ModelId
  claude_effort?: Effort
}

export interface Template {
  id: string
  name: string
  fields: TemplateFields
  created_at: string
  updated_at: string
  last_used_at: string | null
}

export type Settings = Record<string, string>

export interface AppState {
  features: Feature[]
  tasks: Task[]
  settings: Settings
  templates: Template[]
}
