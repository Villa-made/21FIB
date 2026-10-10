import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type ReactNode,
} from 'react'
import { Navigate, useLocation, useNavigate } from 'react-router-dom'
import {
  ALIAS_RULE,
  TURNSTILE_SITE_KEY,
  createProfile,
  fetchMyProfile,
  hasSession,
  isAuthConfigured,
  signIn,
  signOut as doSignOut,
  signUp,
  subscribeAuth,
  userFacingAuthError,
  validateAdultDeclared,
  validateAlias,
  type Profile,
} from './authService'

type AuthStatus = 'loading' | 'anonymous' | 'needs-profile' | 'ready'

interface AuthState {
  status: AuthStatus
  profile: Profile | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading')
  const [profile, setProfile] = useState<Profile | null>(null)

  const refresh = useCallback(async () => {
    if (!(await hasSession())) {
      setProfile(null)
      setStatus('anonymous')
      return
    }
    try {
      const p = await fetchMyProfile()
      setProfile(p)
      setStatus(p ? 'ready' : 'needs-profile')
    } catch {
      setProfile(null)
      setStatus('needs-profile')
    }
  }, [])

  useEffect(() => {
    // refresh() es async: el setState ocurre tras await, no de forma síncrona en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- bootstrap de sesión al montar
    void refresh()
    return subscribeAuth(() => {
      void refresh()
    })
  }, [refresh])

  const signOut = useCallback(async () => {
    await doSignOut()
    setProfile(null)
    setStatus('anonymous')
  }, [])

  const value = useMemo(
    () => ({ status, profile, refresh, signOut }),
    [status, profile, refresh, signOut],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

// Hook exportado junto al provider (tope de archivos T05).
// eslint-disable-next-line react-refresh/only-export-components -- useAuth + AuthProvider
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

const card: CSSProperties = {
  padding: '1.25rem',
  borderRadius: '0.75rem',
  background: '#fff',
  border: '1px solid #e7e5e4',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
}

const inputStyle: CSSProperties = {
  width: '100%',
  boxSizing: 'border-box',
  padding: '0.55rem 0.75rem',
  borderRadius: '0.5rem',
  border: '1px solid #d6d3d1',
  fontSize: '0.95rem',
}

const btnPrimary: CSSProperties = {
  border: 'none',
  borderRadius: '0.5rem',
  padding: '0.6rem 1rem',
  background: '#16a34a',
  color: '#fff',
  fontWeight: 700,
  cursor: 'pointer',
}

const btnGhost: CSSProperties = {
  border: '1px solid #d6d3d1',
  borderRadius: '0.5rem',
  padding: '0.6rem 1rem',
  background: '#fff',
  color: '#44403c',
  fontWeight: 600,
  cursor: 'pointer',
}

const errBox: CSSProperties = {
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
}

const hint: CSSProperties = {
  fontSize: '0.8rem',
  color: '#78716c',
  lineHeight: 1.4,
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
        },
      ) => string
      remove: (id: string) => void
    }
  }
}

function TurnstileBox({
  onToken,
  resetKey,
}: {
  onToken: (token: string | null) => void
  resetKey: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const widgetId = useRef<string | null>(null)

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return
    let cancelled = false

    function mount() {
      if (cancelled || !ref.current || !window.turnstile) return
      if (widgetId.current) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
      ref.current.innerHTML = ''
      widgetId.current = window.turnstile.render(ref.current, {
        sitekey: TURNSTILE_SITE_KEY,
        callback: (token) => onToken(token),
        'expired-callback': () => onToken(null),
        'error-callback': () => onToken(null),
      })
    }

    const existing = document.querySelector('script[data-turnstile]')
    if (window.turnstile) {
      mount()
    } else if (!existing) {
      const script = document.createElement('script')
      script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.dataset.turnstile = '1'
      script.onload = () => mount()
      document.head.appendChild(script)
    } else {
      existing.addEventListener('load', mount)
    }

    return () => {
      cancelled = true
      if (widgetId.current && window.turnstile) {
        window.turnstile.remove(widgetId.current)
        widgetId.current = null
      }
    }
  }, [onToken, resetKey])

  if (!TURNSTILE_SITE_KEY) return null
  return <div ref={ref} />
}

function CompleteProfile() {
  const { refresh, signOut } = useAuth()
  const [alias, setAlias] = useState('')
  const [adult, setAdult] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      validateAdultDeclared(adult)
      const normalized = validateAlias(alias)
      setBusy(true)
      await createProfile(normalized)
      await refresh()
    } catch (err) {
      setError(userFacingAuthError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form style={card} onSubmit={(e) => void submit(e)}>
      <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Completa tu perfil</h1>
      <p style={hint}>Último paso: elige un alias público para participar.</p>
      <label>
        <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
          Alias público
        </span>
        <input
          style={inputStyle}
          value={alias}
          onChange={(ev) => setAlias(ev.target.value)}
          autoComplete="nickname"
          required
        />
        <span style={hint}>{ALIAS_RULE}</span>
      </label>
      <label style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.875rem' }}>
        <input
          type="checkbox"
          checked={adult}
          onChange={(ev) => setAdult(ev.target.checked)}
        />
        <span>
          Declaro que tengo <strong>18 años o más</strong>.
        </span>
      </label>
      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button type="submit" style={btnPrimary} disabled={busy}>
          {busy ? 'Guardando…' : 'Guardar alias'}
        </button>
        <button type="button" style={btnGhost} onClick={() => void signOut()}>
          Salir
        </button>
      </div>
    </form>
  )
}

type Mode = 'login' | 'register'

export default function AuthPage() {
  const { status, refresh } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const from = (location.state as { from?: string } | null)?.from ?? '/'

  const [mode, setMode] = useState<Mode>('register')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [alias, setAlias] = useState('')
  const [adult, setAdult] = useState(false)
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (status === 'loading') {
    return <p style={{ textAlign: 'center', color: '#78716c' }}>Cargando sesión…</p>
  }
  if (status === 'ready') return <Navigate to={from} replace />
  if (status === 'needs-profile') return <CompleteProfile />

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!isAuthConfigured()) {
      setError(
        'La autenticación no está configurada (faltan VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).',
      )
      return
    }
    try {
      if (mode === 'register') {
        validateAdultDeclared(adult)
        validateAlias(alias)
      }
      if (TURNSTILE_SITE_KEY && !captcha) {
        setError('Completa la verificación anti-bots.')
        return
      }
      setBusy(true)
      if (mode === 'register') {
        await signUp(email.trim(), password, captcha)
        try {
          await createProfile(alias)
        } catch (profileErr) {
          await refresh()
          setError(userFacingAuthError(profileErr))
          setCaptcha(null)
          setCaptchaKey((k) => k + 1)
          return
        }
      } else {
        await signIn(email.trim(), password, captcha)
      }
      await refresh()
      navigate(from, { replace: true })
    } catch (err) {
      setError(userFacingAuthError(err))
      setCaptcha(null)
      setCaptchaKey((k) => k + 1)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form style={card} onSubmit={(e) => void submit(e)}>
      <h1 style={{ margin: 0, fontSize: '1.35rem' }}>
        {mode === 'register' ? 'Crear cuenta' : 'Iniciar sesión'}
      </h1>
      <p style={hint}>
        Email y contraseña sin confirmación por correo. En esta beta{' '}
        <strong>no hay recuperación de contraseña por email</strong>.
      </p>

      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <button
          type="button"
          style={mode === 'register' ? btnPrimary : btnGhost}
          onClick={() => setMode('register')}
        >
          Registro
        </button>
        <button
          type="button"
          style={mode === 'login' ? btnPrimary : btnGhost}
          onClick={() => setMode('login')}
        >
          Entrar
        </button>
      </div>

      <label>
        <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
          Email
        </span>
        <input
          style={inputStyle}
          type="email"
          value={email}
          onChange={(ev) => setEmail(ev.target.value)}
          autoComplete="email"
          required
        />
      </label>

      <label>
        <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
          Contraseña
        </span>
        <input
          style={inputStyle}
          type="password"
          value={password}
          onChange={(ev) => setPassword(ev.target.value)}
          autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
          minLength={8}
          required
        />
      </label>

      {mode === 'register' && (
        <>
          <label>
            <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
              Alias público
            </span>
            <input
              style={inputStyle}
              value={alias}
              onChange={(ev) => setAlias(ev.target.value)}
              autoComplete="nickname"
              required
            />
            <span style={hint}>{ALIAS_RULE}</span>
          </label>
          <label
            style={{ display: 'flex', gap: '0.6rem', alignItems: 'flex-start', fontSize: '0.875rem' }}
          >
            <input
              type="checkbox"
              checked={adult}
              onChange={(ev) => setAdult(ev.target.checked)}
            />
            <span>
              Declaro que tengo <strong>18 años o más</strong>.
            </span>
          </label>
        </>
      )}

      <TurnstileBox onToken={setCaptcha} resetKey={captchaKey} />

      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}

      <button type="submit" style={btnPrimary} disabled={busy}>
        {busy ? 'Espera…' : mode === 'register' ? 'Registrarme' : 'Entrar'}
      </button>
    </form>
  )
}
