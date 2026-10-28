/**
 * RepoPicker — choose a git repo from the base folder set in Settings.
 * Stores the repo's full path. A saved path that is not in the scan still
 * shows, marked "not found", so nothing is silently changed.
 */

import { useEffect, useState } from 'react'
import { loadRepos, type RepoList } from '../api'

interface Props {
  value: string | null
  onChange: (path: string | null) => void
  /** Label for the empty choice, e.g. "Feature default (app)". */
  emptyLabel?: string
}

const name = (p: string) => p.replace(/\/+$/, '').split('/').pop() ?? p

export function RepoPicker({ value, onChange, emptyLabel = 'No repo' }: Props) {
  const [list, setList] = useState<RepoList | null>(null)
  useEffect(() => {
    let live = true
    loadRepos().then((r) => { if (live) setList(r) }).catch(() => { if (live) setList({ base: '', repos: [], error: 'Grove could not list repos.' }) })
    return () => { live = false }
  }, [])
  const repos = list?.repos ?? []
  const missing = value && !repos.some((r) => r.path === value)
  return (
    <div>
      <select className="g-input" value={value ?? ''} aria-label="Git repo" onChange={(e) => onChange(e.target.value || null)}>
        <option value="">{emptyLabel}</option>
        {repos.map((r) => <option key={r.path} value={r.path}>{r.name}</option>)}
        {missing && <option value={value}>{name(value)} (not found)</option>}
      </select>
      {list?.error && !repos.length && (
        <div style={{ fontSize: 12, color: 'var(--fg-3)', marginTop: 4 }}>{list.error}</div>
      )}
    </div>
  )
}

export { name as repoName }
