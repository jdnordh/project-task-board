import { useState } from 'react'

/** Top-level page names available in the app. */
type Page = 'board' | 'projects'

/**
 * App — root component.
 *
 * Renders a minimal navigation rail and placeholder content for the
 * "Board" and "Projects" pages. Real routing and full UI come in
 * TASK-003 and TASK-004.
 */
function App() {
  const [page, setPage] = useState<Page>('board')

  return (
    <div style={{ display: 'flex', height: '100vh', fontFamily: 'sans-serif' }}>
      {/* Nav rail */}
      <nav style={{
        width: 200,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        padding: '20px 14px',
        background: '#0b120e',
        borderRight: '1px solid #1e2e24',
      }}>
        <div style={{ fontWeight: 800, fontSize: 18, color: '#e8f4ec', marginBottom: 16 }}>
          Grove
        </div>
        <button
          onClick={() => setPage('board')}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: page === 'board' ? '1px solid #2d5c3e' : '1px solid transparent',
            background: page === 'board' ? '#1a3326' : 'transparent',
            color: page === 'board' ? '#a8e6bc' : '#6b9e7e',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Board
        </button>
        <button
          onClick={() => setPage('projects')}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: page === 'projects' ? '1px solid #2d5c3e' : '1px solid transparent',
            background: page === 'projects' ? '#1a3326' : 'transparent',
            color: page === 'projects' ? '#a8e6bc' : '#6b9e7e',
            fontWeight: 600,
            fontSize: 14,
            cursor: 'pointer',
            textAlign: 'left',
          }}
        >
          Projects
        </button>
      </nav>

      {/* Main content */}
      <main style={{ flex: 1, padding: 32, background: '#0d1710', color: '#c4dcc8' }}>
        {page === 'board' && <BoardPlaceholder />}
        {page === 'projects' && <ProjectsPlaceholder />}
      </main>
    </div>
  )
}

/**
 * BoardPlaceholder — stub for the Kanban board page.
 * Replaced by the real board in TASK-004.
 */
function BoardPlaceholder() {
  return (
    <div>
      <h1 style={{ color: '#e8f4ec', marginTop: 0 }}>Board</h1>
      <p style={{ color: '#6b9e7e' }}>Board page — coming in TASK-004.</p>
    </div>
  )
}

/**
 * ProjectsPlaceholder — stub for the Projects list page.
 * Replaced by the real projects list in TASK-003.
 */
function ProjectsPlaceholder() {
  return (
    <div>
      <h1 style={{ color: '#e8f4ec', marginTop: 0 }}>Projects</h1>
      <p style={{ color: '#6b9e7e' }}>Projects page — coming in TASK-003.</p>
    </div>
  )
}

export default App
