import type { Draft, Feature, Settings, Task, Template } from '../types'
import type { TemplatesModalSpec } from './TemplatesModal'

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

export function TaskDrawer(_props: TaskDrawerProps) {
  return null
}
