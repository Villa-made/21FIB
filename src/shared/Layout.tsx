import { Link, NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '@/features/identity/AuthContext';
import { USE_FIXTURES } from '@/lib/config';

const NAV = [
  { to: '/', label: 'Feed', icon: '🌍', end: true },
  { to: '/contribuir', label: 'Contribuir', icon: '📸', end: false },
  { to: '/ranking', label: 'Ranking', icon: '🏆', end: false },
];

const navClass = ({ isActive }: { isActive: boolean }) =>
  `rounded-lg px-3 py-2 text-sm font-medium ${isActive ? 'bg-brand-50 text-brand-700' : 'text-stone-600 hover:bg-stone-100'}`;

export default function Layout() {
  const { status, profile, signOut } = useAuth();

  return (
    <div className="flex min-h-screen flex-col">
      {USE_FIXTURES && (
        <div className="bg-amber-400 px-4 py-1 text-center text-xs font-semibold text-amber-950">
          MODO DESARROLLO · datos y validaciones simulados
        </div>
      )}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 px-4 py-3">
          <Link to="/" className="flex items-center gap-2 text-lg font-extrabold text-brand-700">
            <span aria-hidden>🌱</span> 21FIB
          </Link>
          <nav className="hidden gap-1 sm:flex" aria-label="Principal">
            {NAV.map((n) => (
              <NavLink key={n.to} to={n.to} end={n.end} className={navClass}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-2 text-sm">
            {status === 'ready' && profile ? (
              <>
                <span className="max-w-[9rem] truncate font-medium text-stone-700">@{profile.alias}</span>
                <button onClick={() => void signOut()} className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100">
                  Salir
                </button>
              </>
            ) : status === 'needs-profile' ? (
              <Link to="/acceso" className="rounded-lg bg-amber-100 px-3 py-1.5 font-medium text-amber-900">
                Completa tu perfil
              </Link>
            ) : status === 'anonymous' ? (
              <Link to="/acceso" className="rounded-lg bg-brand-600 px-3 py-1.5 font-semibold text-white hover:bg-brand-700">
                Entrar
              </Link>
            ) : null}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 sm:pb-10">
        <Outlet />
      </main>

      <footer className="hidden border-t border-stone-200 py-4 text-center text-xs text-stone-500 sm:block">
        <Link to="/privacidad" className="underline">Privacidad y retirada de contenido</Link>
      </footer>

      <nav
        aria-label="Principal móvil"
        className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-3 border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden"
      >
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 py-2 text-xs font-medium ${isActive ? 'text-brand-700' : 'text-stone-500'}`
            }
          >
            <span className="text-xl" aria-hidden>{n.icon}</span>
            {n.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
