import type { Feature, Template, TemplateFields } from '../types'

export interface TemplatesModalSpec {
  prefill?: { name: string; fields: TemplateFields }
  selectId?: string
}

export interface TemplatesModalProps {
  spec: TemplatesModalSpec
  templates: Template[]
  features: Feature[]
  onCreate: (name: string, fields: TemplateFields) => Promise<Template>
  onUpdate: (id: string, name: string, fields: TemplateFields) => Promise<Template>
  onDelete: (id: string) => Promise<void>
  onClose: () => void
}

export function TemplatesModal(_props: TemplatesModalProps) {
  return null
}
