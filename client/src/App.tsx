/**
 * App — root component.
 *
 * Sets up React Router with two routes:
 *   /          → Board page (TASK-004)
 *   /projects  → Projects page (TASK-003)
 *
 * Also renders the shared navigation rail and the aurora background layer.
 */

import { BrowserRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom'
import { ProjectsPage } from './pages/ProjectsPage'
import { BoardPage } from './pages/BoardPage'
import { ProjectDetailPage } from './pages/ProjectDetailPage'
import './styles/design-system.css'

/**
 * NavRail — left navigation sidebar matching the Grove prototype.
 */
function NavRail() {
  return (
    <nav style={{
      width: 212, flexShrink: 0,
      display: 'flex', flexDirection: 'column', gap: 6,
      padding: '20px 14px',
      background: 'rgba(11,18,14,0.72)',
      backdropFilter: 'var(--blur-md)',
      WebkitBackdropFilter: 'var(--blur-md)',
      borderRight: '1px solid var(--border-default)',
      zIndex: 3,
    }}>
      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '6px 8px 22px' }}>
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'var(--grad-canopy)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: 'var(--glow-accent)',
        }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#06150c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <path d="M2 21c0-3 1.85-5.36 5.08-6" />
          </svg>
        </div>
        <span style={{
          fontFamily: 'var(--font-display)', fontStretch: '125%',
          fontWeight: 800, fontSize: 17, color: 'var(--text-strong)', letterSpacing: '-0.02em',
        }}>
          Grove
        </span>
      </div>

      {/* Board nav link */}
      <NavLink to="/" end style={{ textDecoration: 'none' }}>
        {({ isActive }) => (
          <button style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 12px', borderRadius: 12, width: '100%',
            border: `1px solid ${isActive ? 'var(--accent-soft-2)' : 'transparent'}`,
            background: isActive ? 'var(--accent-soft)' : 'transparent',
            color: isActive ? 'var(--canopy-300)' : 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
            cursor: 'pointer', textAlign: 'left',
            transition: 'all var(--dur-fast) var(--ease-grow)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="18" rx="1.6" />
              <rect x="14" y="3" width="7" height="11" rx="1.6" />
            </svg>
            Board
          </button>
        )}
      </NavLink>

      {/* Projects nav link */}
      <NavLink to="/projects" style={{ textDecoration: 'none' }}>
        {({ isActive }) => (
          <button style={{
            display: 'flex', alignItems: 'center', gap: 12,
            padding: '11px 12px', borderRadius: 12, width: '100%',
            border: `1px solid ${isActive ? 'var(--accent-soft-2)' : 'transparent'}`,
            background: isActive ? 'var(--accent-soft)' : 'transparent',
            color: isActive ? 'var(--canopy-300)' : 'var(--text-muted)',
            fontFamily: 'var(--font-body)', fontWeight: 600, fontSize: 14,
            cursor: 'pointer', textAlign: 'left',
            transition: 'all var(--dur-fast) var(--ease-grow)',
          }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 10c-2 0-3-1.5-3-4s1.5-4 3-4 3 1.5 3 4M14 14c2 0 3-1.5 3-3.5" />
              <path d="M12 22V8" />
              <path d="M9 13c-2.5 0-4-1.5-4-4M15 16c2 0 4-1 4-3.5" />
            </svg>
            Projects
          </button>
        )}
      </NavLink>
    </nav>
  )
}

interface TopBarProps {
  /** Called when "+ New task" is clicked. Wired to the drawer in TASK-005. */
  onNewTask?: () => void
}

/**
 * TopBar — top header bar with route-aware title and primary action button.
 * The "+ New task" button is a placeholder; it opens the task drawer in TASK-005.
 */
function TopBar({ onNewTask }: TopBarProps) {
  const location = useLocation()
  const isBoard = location.pathname === '/'
  const title = isBoard ? 'Board' : 'Projects'

  return (
    <header style={{
      flexShrink: 0, height: 68,
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 28px',
      borderBottom: '1px solid var(--border-default)',
      background: 'rgba(8,13,10,0.55)',
      backdropFilter: 'var(--blur-sm)',
      WebkitBackdropFilter: 'var(--blur-sm)',
      zIndex: 2,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
        <h1 style={{
          fontFamily: 'var(--font-display)', fontStretch: '125%',
          fontSize: 24, fontWeight: 800, color: 'var(--text-strong)', letterSpacing: '-0.02em',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {title}
        </h1>
      </div>
      <button
        onClick={onNewTask}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8,
          padding: '11px 18px', borderRadius: 14,
          border: '1px solid transparent',
          background: 'var(--grad-canopy)',
          color: 'var(--text-on-accent)',
          fontFamily: 'var(--font-body)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
          boxShadow: 'var(--glow-accent)',
        }}
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 5v14M5 12h14" />
        </svg>
        New task
      </button>
    </header>
  )
}

/**
 * AppShell — the page layout: aurora + nav rail + content column.
 */
function AppShell() {
  return (
    <div style={{ position: 'relative', zIndex: 1, display: 'flex', height: '100vh', width: '100%', fontFamily: 'var(--font-body)', color: 'var(--text-body)', overflow: 'hidden' }}>
      <NavRail />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* onNewTask is a no-op stub until TASK-005 wires the drawer */}
        <TopBar onNewTask={undefined} />

        <Routes>
          <Route path="/" element={<BoardPage />} />
          <Route path="/projects" element={<ProjectsPage />} />
          <Route path="/projects/:id" element={<ProjectDetailPage />} />
        </Routes>
      </div>
    </div>
  )
}

/**
 * App — BrowserRouter wrapper + aurora background.
 */
function App() {
  return (
    <BrowserRouter>
      <div className="tf-aurora" />
      <AppShell />
    </BrowserRouter>
  )
}

export default App
