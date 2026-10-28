/**
 * api.ts — the one fetch wrapper. After every non-GET request (except
 * settings and achievements) it fires a `grove-mutation` window event,
 * which the achievement checker listens for.
 */

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export const MUTATION_EVENT = 'grove-mutation'

/** Upload a picture's bytes; the server checks the type. */
export async function uploadImage(file: Blob): Promise<{ id: string; url: string }> {
  const res = await fetch('/api/images', { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream' }, body: file })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json as { id: string; url: string }
}

export interface RepoList {
  base: string
  repos: { name: string; path: string }[]
  error?: string
}

let repoCache: Promise<RepoList> | null = null
/** The repos in the base folder; cached until `fresh`. */
export function loadRepos(fresh = false): Promise<RepoList> {
  if (fresh || !repoCache) repoCache = api<RepoList>('GET', '/api/repos').catch((e) => { repoCache = null; throw e })
  return repoCache
}

export async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (method !== 'GET' && !url.startsWith('/api/settings') && !url.startsWith('/api/achievements')) {
    window.dispatchEvent(new Event(MUTATION_EVENT))
  }
  if (res.status === 204) return undefined as T
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status, (json as { error?: string }).error ?? `HTTP ${res.status}`)
  return json as T
}
