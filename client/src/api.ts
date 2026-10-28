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
