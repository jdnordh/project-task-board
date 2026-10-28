import type { ColumnId, Feature, Settings, Task } from '../types'

export interface BoardPageProps {
  tasks: Task[]
  features: Feature[]
  settings: Settings
  search: string
  onMove: (id: string, status: ColumnId) => void
  onOpen: (t: Task) => void
  onNew: (status: ColumnId) => void
  onCopyPrompt: (t: Task) => void
  onSaveSettings: (patch: Record<string, string>) => void
  onOpenTemplates: () => void
}

export function BoardPage({ tasks }: BoardPageProps) {
  return <h1>Board ({tasks.length})</h1>
}
