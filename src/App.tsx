import type { CSSProperties } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import FeedPage from './features/community/FeedPage'
import ContributionForm from './features/contributions/ContributionForm'
import ContributionStatus from './features/contributions/ContributionStatus'
import AuthPage, { AuthProvider, useAuth } from './features/identity/AuthPage'
import LeaderboardPage from './features/scoring/LeaderboardPage'

/** Overrides de plantilla Vite + nav responsive (sin tocar index.css ajeno). */
const SHELL_CSS = `
#root {
  width: 100%;
  max-width: 100%;
  margin: 0;
  text-align: initial;
  border-inline: none;
  min-height: 100svh;
}
.app-mobile-nav a {
  min-height: 48px;
  touch-action: manipulation;
  justify-content: center;
  box-sizing: border-box;
}
@media (max-width: 719px) {
  .nav-desktop { display: none !important; }
  .app-main { padding-bottom: 5.75rem; }
}
@media (min-width: 720px) {
  .app-mobile-nav { display: none !important; }
  .app-main { padding-bottom: 1.25rem; }
}
`

const shell: CSSProperties = {
  minHeight: '100svh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, Segoe UI, sans-serif',
  color: '#1c1917',
  background: '#fafaf9',
  textAlign: 'left',
  width: '100%',
}

const header: CSSProperties = {
  position: 'sticky',
  top: 0,
  zIndex: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '0.75rem',
  padding: '0.75rem 1rem',
  borderBottom: '1px solid #e7e5e4',
  background: 'rgba(255,255,255,0.92)',
  backdropFilter: 'blur(8px)',
}

const brand: CSSProperties = {
  fontWeight: 800,
  fontSize: '1.125rem',
  color: '#15803d',
  textDecoration: 'none',
  flexShrink: 0,
}

const navDesktop: CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
  flexWrap: 'wrap',
}

const main: CSSProperties = {
  width: '100%',
  maxWidth: '42rem',
  margin: '0 auto',
  flex: 1,
  padding: '1.25rem 1rem',
  boxSizing: 'border-box',
}

const mobileNav: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  zIndex: 20,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  borderTop: '1px solid #e7e5e4',
  background: '#fff',
  paddingBottom: 'env(safe-area-inset-bottom)',
  minHeight: '48px',
}

const linkBtn: CSSProperties = {
  borderRadius: '0.5rem',
  padding: '0.5rem 0.75rem',
  background: '#16a34a',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: '0.875rem',
  minHeight: '44px',
  display: 'inline-flex',
  alignItems: 'center',
  touchAction: 'manipulation',
  boxSizing: 'border-box',
}

const ghostBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#57534e',
  cursor: 'pointer',
  fontSize: '0.875rem',
  padding: '0.5rem 0.6rem',
  minHeight: '44px',
  touchAction: 'manipulation',
}

const NAV = [
  { to: '/', label: 'Feed', end: true },
  { to: '/contribuir', label: 'Contribuir', end: false },
  { to: '/ranking', label: 'Ranking', end: false },
  { to: '/acceso', label: 'Acceso', end: false },
] as const

function navStyle(isActive: boolean): CSSProperties {
  return {
    borderRadius: '0.5rem',
    padding: '0.5rem 0.75rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: isActive ? '#15803d' : '#57534e',
    background: isActive ? '#f0fdf4' : 'transparent',
    minHeight: '44px',
    display: 'inline-flex',
    alignItems: 'center',
    touchAction: 'manipulation',
    boxSizing: 'border-box',
  }
}

function mobileNavStyle(isActive: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '0.15rem',
    padding: '0.5rem 0.25rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: isActive ? '#15803d' : '#78716c',
    minHeight: '48px',
    touchAction: 'manipulation',
  }
}

function HeaderAuth() {
  const { status, profile, signOut } = useAuth()
  if (status === 'ready' && profile) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem' }}>
        <span style={{ fontWeight: 600, maxWidth: '9rem', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          @{profile.alias}
        </span>
        <button type="button" style={ghostBtn} onClick={() => void signOut()}>
          Salir
        </button>
      </div>
    )
  }
  if (status === 'needs-profile') {
    return (
      <Link to="/acceso" style={{ ...linkBtn, background: '#f59e0b', color: '#78350f' }}>
        Completa tu perfil
      </Link>
    )
  }
  if (status === 'anonymous') {
    return (
      <Link to="/acceso" style={linkBtn}>
        Entrar
      </Link>
    )
  }
  return null
}

function ShellLayout() {
  return (
    <div style={shell}>
      <style>{SHELL_CSS}</style>
      <header style={header}>
        <Link to="/" style={brand}>
          21FIB
        </Link>
        <nav style={navDesktop} aria-label="Principal" className="nav-desktop">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              style={({ isActive }) => navStyle(isActive)}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <HeaderAuth />
      </header>

      <main style={main} className="app-main">
        <Routes>
          <Route index element={<FeedPage />} />
          <Route path="ranking" element={<LeaderboardPage />} />
          <Route path="contribuir" element={<ContributionForm />} />
          <Route path="contribuciones/:id" element={<ContributionStatus />} />
          <Route path="acceso" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav style={mobileNav} aria-label="Principal móvil" className="app-mobile-nav">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            style={({ isActive }) => mobileNavStyle(isActive)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <ShellLayout />
    </AuthProvider>
  )
}
