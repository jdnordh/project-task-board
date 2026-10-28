import type { Settings } from '../types'

export function SettingsPage(_props: { settings: Settings; onSave: (patch: Record<string, string>) => void }) {
  return <h1>Settings</h1>
}
