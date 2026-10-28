/**
 * App — the root. Holds all app state, loads it once from GET /api/state,
 * and owns every mutation: each handler updates local state optimistically,
 * then calls the API. Pages get data and handlers as props.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api'
import { copyText } from './clipboard'
import type { AppState, ColumnId, Draft, Feature, Settings, Task, Template, TemplateFields } from './types'
import {
  claudePrompt, claudeSetup, setupLabel, cleanDefaultEst, parseHidden, effectiveHidden, isVisible, firstVisible,
} from './lib'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { ConfirmDialog, type ConfirmSpec } from './components/ui'
import { PromptNotice, type NoticeSpec } from './components/PromptNotice'
import { TaskDrawer } from './components/TaskDrawer'
import { TemplatesModal, type TemplatesModalSpec } from './components/TemplatesModal'
import { BoardPage } from './pages/BoardPage'
import { FeaturesPage } from './pages/FeaturesPage'
import { SettingsPage } from './pages/SettingsPage'
import { AchievementsPage } from './pages/AchievementsPage'
import { ExtrasContext, type ExtrasState } from './extras/skins'
import { drawTextures } from './extras/textures'
import { UnlockToasts, expandQueue, type ToastItem } from './extras/UnlockToasts'
import type { AchievementsPayload } from './extras/types'
import { MUTATION_EVENT } from './api'

const MERGE_KEYS = ['agent_state', 'agent_note', 'agent_at', 'agent_report', 'files', 'subtasks'] as const
const NARROW = '(max-width: 1100px)'

type AgentStatusReply = { cli: string; tasks: Pick<Task, 'id' | (typeof MERGE_KEYS)[number]>[] }

function readHash(): string[] {
  return location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent)
}

export function navigate(page: string, ...sub: string[]) {
  location.hash = '#/' + [page, ...sub].map(encodeURIComponent).join('/')
}

export default function App() {
  const [features, setFeatures] = useState<Feature[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings>({})
  const [templates, setTemplates] = useState<Template[]>([])
  const [loaded, setLoaded] = useState(false)
  const [route, setRoute] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<{ key: number; task: Task | Draft } | null>(null)
  const [tplModal, setTplModal] = useState<TemplatesModalSpec | null>(null)
  const [notice, setNotice] = useState<NoticeSpec | null>(null)
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null)
  const [addFeatureSignal, setAddFeatureSignal] = useState(0)
  const [collapsed, setCollapsed] = useState(() => window.matchMedia(NARROW).matches)
  const cliRef = useRef('')
  const [ach, setAch] = useState<AchievementsPayload | null>(null)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastKeys = useRef(new Set<string>())

  const extras = settings.extras === 'true'
  const hidden = useMemo(() => parseHidden(settings.hidden_pages), [settings.hidden_pages])
  const effHidden = useMemo(() => effectiveHidden(hidden, extras), [hidden, extras])
  const hiddenRef = useRef(effHidden)
  hiddenRef.current = effHidden

  // ---- load --------------------------------------------------------------------
  const load = useCallback(async () => {
    const s = await api<AppState>('GET', '/api/state')
    setFeatures(s.features)
    setTasks(s.tasks)
    setSettings(s.settings)
    setTemplates(s.templates)
    return s
  }, [])

  const [loadError, setLoadError] = useState(false)
  const [bootTry, setBootTry] = useState(0)

  useEffect(() => {
    setLoadError(false)
    load().then((s) => {
      const h = parseHidden(s.settings.hidden_pages)
      const ex = s.settings.extras === 'true'
      const fromHash = readHash()
      let page: string[]
      if (fromHash[0] && isVisible(fromHash[0], h, ex)) page = fromHash
      else if (s.settings.route && isVisible(s.settings.route, h, ex)) page = [s.settings.route]
      else page = [firstVisible(h, ex)]
      if (readHash().join('/') !== page.join('/')) history.replaceState(null, '', '#/' + page.join('/'))
      setRoute(page)
      setLoaded(true)
    }, () => setLoadError(true))
  }, [load, bootTry])

  // ---- routing: hashchange is the only caller of setRoute after boot --------
  useEffect(() => {
    const onHash = () => {
      const r = readHash()
      if (!r[0] || hiddenRef.current.includes(r[0]) || !['board', 'features', 'achievements', 'settings'].includes(r[0])) {
        // hiddenRef already holds the effective list, Extras folded in.
        const first = firstVisible(hiddenRef.current, true)
        history.replaceState(null, '', '#/' + first)
        setRoute([first])
        return
      }
      setRoute(r)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  // A page that becomes hidden while shown redirects to the first visible one.
  useEffect(() => {
    if (!loaded || !route[0]) return
    if (effHidden.includes(route[0])) {
      const first = firstVisible(hidden, extras)
      history.replaceState(null, '', '#/' + first)
      setRoute([first])
    }
  }, [effHidden, hidden, extras, loaded, route])

  // ---- settings ---------------------------------------------------------------
  const saveSettings = useCallback((patch: Record<string, string>) => {
    setSettings((s) => ({ ...s, ...patch }))
    api<Settings>('PATCH', '/api/settings', patch).catch(() => load())
  }, [load])

  useEffect(() => {
    if (loaded && route[0] && settings.route !== route[0]) saveSettings({ route: route[0] })
  }, [route, loaded, settings.route, saveSettings])

  // ---- sidebar auto-collapse when crossing the narrow breakpoint ----------------
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const on = (e: MediaQueryListEvent) => setCollapsed(e.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])

  // ---- Claude column: prompt copy and polling ---------------------------------
  const featureOf = useCallback((id: string) => features.find((f) => f.id === id), [features])

  const copyClaudePrompt = useCallback((task: Task) => {
    const feature = featureOf(task.feature)
    const text = claudePrompt(task, cliRef.current, feature?.name)
    const setup = setupLabel(claudeSetup(task, feature))
    // copyText starts synchronously: nothing may be awaited before this call.
    copyText(text).then((copied) => setNotice({ key: Date.now(), title: task.title, text, setup, copied }))
  }, [featureOf])

  const pollAgents = useCallback(async () => {
    try {
      const r = await api<AgentStatusReply>('GET', '/api/agent-status')
      cliRef.current = r.cli
      const byId = new Map(r.tasks.map((t) => [t.id, t]))
      setTasks((ts) => {
        let changed = false
        const next = ts.map((t) => {
          const a = byId.get(t.id)
          if (!a) return t
          const same = MERGE_KEYS.every((k) => JSON.stringify(t[k]) === JSON.stringify(a[k]))
          if (same) return t
          changed = true
          const patch: Partial<Task> = {}
          for (const k of MERGE_KEYS) (patch as Record<string, unknown>)[k] = a[k]
          return { ...t, ...patch }
        })
        return changed ? next : ts
      })
    } catch {
      // server unreachable: the next poll tries again
    }
  }, [])

  const anyInClaude = tasks.some((t) => t.status === 'claude')
  useEffect(() => { if (loaded) pollAgents() }, [loaded, pollAgents])
  useEffect(() => {
    if (!anyInClaude) return
    const id = setInterval(pollAgents, 10000)
    return () => clearInterval(id)
  }, [anyInClaude, pollAgents])
  useEffect(() => {
    window.addEventListener('focus', pollAgents)
    return () => window.removeEventListener('focus', pollAgents)
  }, [pollAgents])

  // ---- Extras: achievement checks, textures, unlock toasts ------------------------
  const runCheck = useCallback(async (action: boolean) => {
    try {
      const r = await api<AchievementsPayload>('POST', '/api/achievements/check', { action })
      setAch(r)
      const fresh = expandQueue(r.queue, r.hint).filter((t) => !toastKeys.current.has(t.key))
      fresh.forEach((t) => toastKeys.current.add(t.key))
      if (fresh.length) setToasts((q) => [...q, ...fresh])
    } catch {
      // try again on the next write or focus
    }
  }, [])

  useEffect(() => {
    if (!loaded) return
    if (!extras) {
      setToasts([])
      toastKeys.current.clear()
      return
    }
    drawTextures()
    runCheck(false)
    let timer: ReturnType<typeof setTimeout> | undefined
    let pendingAction = false
    const schedule = (action: boolean) => {
      pendingAction = pendingAction || action
      clearTimeout(timer)
      timer = setTimeout(() => { runCheck(pendingAction); pendingAction = false }, 1500)
    }
    const onMutation = () => schedule(true)
    const onFocus = () => schedule(false)
    window.addEventListener(MUTATION_EVENT, onMutation)
    window.addEventListener('focus', onFocus)
    return () => {
      clearTimeout(timer)
      window.removeEventListener(MUTATION_EVENT, onMutation)
      window.removeEventListener('focus', onFocus)
    }
  }, [extras, loaded, runCheck])

  // Pause every animation while the tab is hidden or the window unfocused.
  useEffect(() => {
    const sync = () => document.documentElement.classList.toggle('g-idle', document.hidden || !document.hasFocus())
    sync()
    document.addEventListener('visibilitychange', sync)
    window.addEventListener('blur', sync)
    window.addEventListener('focus', sync)
    return () => {
      document.removeEventListener('visibilitychange', sync)
      window.removeEventListener('blur', sync)
      window.removeEventListener('focus', sync)
    }
  }, [])

  const extrasState = useMemo<ExtrasState>(() => ({
    extras,
    points: ach?.points ?? 0,
    camos: new Set(ach?.camos ?? []),
    earned: new Set((ach?.achievements ?? []).filter((a) => a.unlocked_at).map((a) => a.id)),
  }), [extras, ach])

  const onToastShow = useCallback((t: ToastItem) => {
    // Mark seen as it shows, so a reload mid-queue does not replay it.
    if (t.type === 'ach') api('POST', '/api/achievements/seen', { ids: [t.id] }).catch(() => {})
    if (t.type === 'hint') api('POST', '/api/achievements/hint-seen', { id: t.id }).catch(() => {})
  }, [])
  const onToastDone = useCallback((key: string) => setToasts((q) => q.filter((t) => t.key !== key)), [])
  const onToastSkip = useCallback(() => {
    setToasts((q) => {
      const rest = q.slice(1)
      const ids = rest.filter((t) => t.type === 'ach').map((t) => t.id)
      if (ids.length) api('POST', '/api/achievements/seen', { ids }).catch(() => {})
      const hint = rest.find((t) => t.type === 'hint')
      if (hint) api('POST', '/api/achievements/hint-seen', { id: hint.id }).catch(() => {})
      return q.slice(0, 1)
    })
  }, [])

  // ---- tasks --------------------------------------------------------------------
  const activeFeatures = useMemo(() => features.filter((f) => !f.completed), [features])

  const defaultFeature = useCallback(() => {
    const last = settings.lastTaskFeature
    if (last && activeFeatures.some((f) => f.id === last)) return last
    return activeFeatures[0]?.id ?? features[0]?.id ?? ''
  }, [settings.lastTaskFeature, activeFeatures, features])

  const openNew = useCallback((status: ColumnId) => {
    const draft: Draft = {
      _new: true, title: '', feature: defaultFeature(), priority: 2, est: cleanDefaultEst(settings.default_est),
      due: null, status, desc: '', desc_html: '', subtasks: [], claude_model: null, claude_effort: null,
    }
    setDrawer({ key: Date.now(), task: draft })
  }, [defaultFeature, settings.default_est])

  const openTask = useCallback((task: Task) => setDrawer({ key: Date.now(), task }), [])

  const mergeReply = (reply: Task) => setTasks((ts) => ts.map((t) => (t.id === reply.id ? { ...reply, files: t.files } : t)))

  const moveTask = useCallback(async (id: string, status: ColumnId) => {
    const task = tasks.find((t) => t.id === id)
    if (!task || task.status === status) return
    const entering = status === 'claude'
    if (entering) copyClaudePrompt(task) // before any await
    setTasks((ts) => ts.map((t) => (t.id === id
      ? { ...t, status, ...(entering ? { agent_state: null, agent_note: '', agent_at: null } : {}) }
      : t)))
    try {
      mergeReply(await api<Task>('PATCH', `/api/tasks/${id}`, { status }))
    } catch {
      load()
    }
  }, [tasks, copyClaudePrompt, load])

  const saveTask = useCallback(async (draft: Draft, original: Task | Draft) => {
    if (!draft.title.trim()) return
    const base = {
      title: draft.title.trim(), feature: draft.feature, priority: draft.priority, est: draft.est, due: draft.due,
      status: draft.status, desc: draft.desc, desc_html: draft.desc_html, claude_model: draft.claude_model, claude_effort: draft.claude_effort,
    }
    if (('_new' in original && original._new) || !original.id) {
      const body = { ...base, subtasks: draft.subtasks }
      const created = await api<Task>('POST', '/api/tasks', body)
      const withState = draft.agent_state || draft.agent_note
        ? await api<Task>('PATCH', `/api/tasks/${created.id}`, { agent_state: draft.agent_state ?? null, agent_note: draft.agent_note ?? '' })
        : created
      setTasks((ts) => [...ts, { ...withState, files: [] }])
      if (draft.feature !== settings.lastTaskFeature) saveSettings({ lastTaskFeature: draft.feature })
      if (draft.status === 'claude') copyClaudePrompt({ ...withState, files: [] })
      return
    }
    const orig = original as Task
    const patch: Record<string, unknown> = { ...base }
    // Only send what the user changed: a Claude session may have written
    // agent fields or ticked subtasks while the drawer was open.
    if ((draft.agent_state ?? null) !== (orig.agent_state ?? null)) patch.agent_state = draft.agent_state ?? null
    if ((draft.agent_note ?? '') !== (orig.agent_note ?? '')) patch.agent_note = draft.agent_note ?? ''
    if (JSON.stringify(draft.subtasks) !== JSON.stringify(orig.subtasks)) patch.subtasks = draft.subtasks
    const entering = draft.status === 'claude' && orig.status !== 'claude'
    const live = tasks.find((t) => t.id === orig.id)
    if (entering && live) copyClaudePrompt({ ...live, ...base } as Task)
    setTasks((ts) => ts.map((t) => (t.id === orig.id ? { ...t, ...(patch as Partial<Task>), ...(entering && !('agent_state' in patch) ? { agent_state: null, agent_note: '' } : {}) } : t)))
    if (draft.feature !== orig.feature) saveSettings({ lastTaskFeature: draft.feature })
    try {
      mergeReply(await api<Task>('PATCH', `/api/tasks/${orig.id}`, patch))
    } catch {
      load()
    }
  }, [tasks, settings.lastTaskFeature, saveSettings, copyClaudePrompt, load])

  const deleteTask = useCallback(async (id: string) => {
    setTasks((ts) => ts.filter((t) => t.id !== id))
    await api('DELETE', `/api/tasks/${id}`).catch(() => load())
  }, [load])

  const removeFile = useCallback(async (taskId: string, fileId: string) => {
    setTasks((ts) => ts.map((t) => (t.id === taskId ? { ...t, files: t.files.filter((f) => f.id !== fileId) } : t)))
    await api('DELETE', `/api/task-files/${fileId}`).catch(() => load())
  }, [load])

  // ---- features -----------------------------------------------------------------
  const createFeature = useCallback(async (body: { name: string; color: string; skin: string | null }) => {
    const f = await api<Feature>('POST', '/api/features', body)
    setFeatures((fs) => [...fs, f])
    return f
  }, [])

  const updateFeature = useCallback(async (id: string, patch: Partial<Feature>) => {
    // Always send skin, even when null, so a PATCH never leaves it ambiguous.
    const body = 'skin' in patch ? patch : { ...patch, skin: features.find((f) => f.id === id)?.skin ?? null }
    setFeatures((fs) => fs.map((f) => (f.id === id ? { ...f, ...patch } : f)))
    try {
      const f = await api<Feature>('PATCH', `/api/features/${id}`, body)
      setFeatures((fs) => fs.map((x) => (x.id === id ? f : x)))
    } catch {
      load()
    }
  }, [features, load])

  const deleteFeature = useCallback(async (id: string) => {
    setFeatures((fs) => fs.filter((f) => f.id !== id))
    setTasks((ts) => ts.filter((t) => t.feature !== id))
    await api('DELETE', `/api/features/${id}`).catch(() => load())
  }, [load])

  // ---- templates -----------------------------------------------------------------
  const createTemplate = useCallback(async (name: string, fields: TemplateFields) => {
    const t = await api<Template>('POST', '/api/task-templates', { name, fields })
    setTemplates((ts) => [...ts, t])
    return t
  }, [])

  const updateTemplate = useCallback(async (id: string, name: string, fields: TemplateFields) => {
    const t = await api<Template>('PATCH', `/api/task-templates/${id}`, { name, fields })
    setTemplates((ts) => ts.map((x) => (x.id === id ? t : x)))
    return t
  }, [])

  const deleteTemplate = useCallback(async (id: string) => {
    setTemplates((ts) => ts.filter((t) => t.id !== id))
    await api('DELETE', `/api/task-templates/${id}`).catch(() => load())
  }, [load])

  const markTemplateUsed = useCallback((id: string) => {
    const ts = new Date().toISOString()
    setTemplates((list) => list.map((t) => (t.id === id ? { ...t, last_used_at: ts } : t)))
    api('POST', `/api/task-templates/${id}/used`).catch(() => {})
  }, [])

  // ---- render -------------------------------------------------------------------
  if (!loaded) {
    return (
      <div style={{ display: 'grid', placeItems: 'center', height: '100%', color: 'var(--fg-3)', textAlign: 'center' }}>
        {loadError ? (
          <div>
            <p style={{ margin: '0 0 12px' }}>Can't reach the Grove server on port 3004. Start it with <code>npm run dev</code>.</p>
            <button type="button" className="g-btn g-ghost" onClick={() => setBootTry((n) => n + 1)}
              style={{ padding: '8px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'transparent', color: 'var(--fg-1)', cursor: 'pointer' }}>
              Try again
            </button>
          </div>
        ) : 'Loading…'}
      </div>
    )
  }

  const page = route[0] ?? 'board'
  const boardVisible = !effHidden.includes('board')
  const counts = {
    board: tasks.filter((t) => t.status !== 'done').length,
    features: activeFeatures.length,
  }

  return (
    <ExtrasContext.Provider value={extrasState}>
    <div style={{ display: 'flex', height: '100vh', width: '100%', overflow: 'hidden', fontFamily: 'var(--font-body)' }}>
      <Sidebar page={page} hidden={effHidden} collapsed={collapsed} onToggle={() => setCollapsed((c) => !c)} counts={counts} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overflowX: 'hidden' }}>
        <TopBar
          search={search}
          onSearch={setSearch}
          page={page}
          userName={settings.user_name ?? ''}
          showNewTask={boardVisible}
          onPrimary={() => (page === 'features' ? setAddFeatureSignal((n) => n + 1) : openNew('week'))}
        />
        <main key={route.join('/')} style={{ flex: 1, padding: '22px 28px 40px', minWidth: 0 }}>
          {page === 'board' && (
            <BoardPage
              tasks={tasks} features={features} settings={settings} search={search}
              onMove={moveTask} onOpen={openTask} onNew={openNew} onCopyPrompt={copyClaudePrompt}
              onSaveSettings={saveSettings} onOpenTemplates={() => setTplModal({})}
            />
          )}
          {page === 'features' && (
            <FeaturesPage
              features={features} tasks={tasks} extras={extras} addSignal={addFeatureSignal}
              onCreate={createFeature} onUpdate={updateFeature} onDelete={deleteFeature} onConfirm={setConfirm}
            />
          )}
          {page === 'settings' && <SettingsPage settings={settings} onSave={saveSettings} />}
          {page === 'achievements' && <AchievementsPage data={ach} target={route[1]} />}
        </main>
      </div>

      {drawer && (
        <TaskDrawer
          key={drawer.key}
          task={drawer.task}
          live={drawer.task.id ? tasks.find((t) => t.id === drawer.task.id) : undefined}
          features={features}
          settings={settings}
          templates={templates}
          templatesOpen={!!tplModal}
          onSave={async (d) => { await saveTask(d, drawer.task); setDrawer(null) }}
          onDelete={async () => { if (drawer.task.id) await deleteTask(drawer.task.id); setDrawer(null) }}
          onClose={() => setDrawer(null)}
          onRemoveFile={removeFile}
          onUseTemplate={markTemplateUsed}
          onOpenTemplates={(spec) => setTplModal(spec)}
        />
      )}
      {tplModal && (
        <TemplatesModal
          spec={tplModal} templates={templates} features={features}
          onCreate={createTemplate} onUpdate={updateTemplate} onDelete={deleteTemplate}
          onClose={() => setTplModal(null)}
        />
      )}
      {notice && <PromptNotice key={notice.key} spec={notice} onClose={() => setNotice(null)} />}
      {confirm && <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />}
      {extras && (
        <UnlockToasts queue={toasts} canOpen={!effHidden.includes('achievements')}
          onShow={onToastShow} onDone={onToastDone} onSkipAll={onToastSkip} onOpen={(target) => navigate('achievements', target)} />
      )}
    </div>
    </ExtrasContext.Provider>
  )
}
