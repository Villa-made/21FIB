import type { CSSProperties, ReactNode } from 'react'
import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom'
import ContributionForm from './features/contributions/ContributionForm'
import ContributionStatus from './features/contributions/ContributionStatus'
import AuthPage, { AuthProvider, useAuth } from './features/identity/AuthPage'

const shell: CSSProperties = {
  minHeight: '100svh',
  display: 'flex',
  flexDirection: 'column',
  fontFamily: 'system-ui, Segoe UI, sans-serif',
  color: '#1c1917',
  background: '#fafaf9',
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
}

const navDesktop: CSSProperties = {
  display: 'flex',
  gap: '0.25rem',
}

const main: CSSProperties = {
  width: '100%',
  maxWidth: '42rem',
  margin: '0 auto',
  flex: 1,
  padding: '1.25rem 1rem 5.5rem',
}

const banner: CSSProperties = {
  marginBottom: '1rem',
  padding: '0.75rem 1rem',
  borderRadius: '0.5rem',
  background: '#fef3c7',
  color: '#78350f',
  fontSize: '0.875rem',
  fontWeight: 600,
}

const card: CSSProperties = {
  padding: '1.25rem',
  borderRadius: '0.75rem',
  background: '#fff',
  border: '1px solid #e7e5e4',
}

const mobileNav: CSSProperties = {
  position: 'fixed',
  left: 0,
  right: 0,
  bottom: 0,
  display: 'grid',
  gridTemplateColumns: 'repeat(4, 1fr)',
  borderTop: '1px solid #e7e5e4',
  background: '#fff',
  paddingBottom: 'env(safe-area-inset-bottom)',
}

const linkBtn: CSSProperties = {
  borderRadius: '0.5rem',
  padding: '0.4rem 0.75rem',
  background: '#16a34a',
  color: '#fff',
  fontWeight: 700,
  textDecoration: 'none',
  fontSize: '0.875rem',
}

const ghostBtn: CSSProperties = {
  border: 'none',
  background: 'transparent',
  color: '#57534e',
  cursor: 'pointer',
  fontSize: '0.875rem',
  padding: '0.35rem 0.5rem',
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
  }
}

function mobileNavStyle(isActive: boolean): CSSProperties {
  return {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.15rem',
    padding: '0.6rem 0.25rem',
    fontSize: '0.7rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: isActive ? '#15803d' : '#78716c',
  }
}

function Provisional({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={card}>
      <div style={banner} role="status">
        Contenido provisional · sin puntos ni aprobaciones en cliente
      </div>
      <h1 style={{ margin: '0 0 0.75rem', fontSize: '1.5rem' }}>{title}</h1>
      <div style={{ color: '#57534e', lineHeight: 1.5 }}>{children}</div>
    </section>
  )
}

function FeedPlaceholder() {
  return (
    <Provisional title="Feed">
      Aquí aparecerán publicaciones aprobadas (últimos 30 días). Visitantes
      anónimos podrán leer el feed cuando el backend (T16) esté disponible.
    </Provisional>
  )
}

function RankingPlaceholder() {
  return (
    <Provisional title="Ranking">
      Clasificación global por puntos derivados. Empates compartidos según
      contrato v1. Sin puntuación calculada en el navegador.
    </Provisional>
  )
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

      <main style={main}>
        <Routes>
          <Route index element={<FeedPlaceholder />} />
          <Route path="ranking" element={<RankingPlaceholder />} />
          <Route path="contribuir" element={<ContributionForm />} />
          <Route path="contribuciones/:id" element={<ContributionStatus />} />
          <Route path="acceso" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      <nav style={mobileNav} aria-label="Principal móvil">
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
