import type { Feature, Task } from '../types'
import type { ConfirmSpec } from '../components/ui'

export interface FeaturesPageProps {
  features: Feature[]
  tasks: Task[]
  extras: boolean
  addSignal: number
  onCreate: (b: { name: string; color: string; skin: string | null }) => Promise<Feature>
  onUpdate: (id: string, patch: Partial<Feature>) => void
  onDelete: (id: string) => void
  onConfirm: (c: ConfirmSpec) => void
}

export function FeaturesPage({ features }: FeaturesPageProps) {
  return <h1>Features ({features.length})</h1>
}
