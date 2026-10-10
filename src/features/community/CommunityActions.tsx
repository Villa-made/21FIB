import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
} from 'react'
import { Link } from 'react-router-dom'
import { TURNSTILE_SITE_KEY } from '../identity/authService'
import { useAuth } from '../identity/AuthPage'
import {
  applyLikeToggle,
  canToggleLike,
  communityErrorMessage,
  hideContribution,
  isOwnPost,
  likeContribution,
  reportContribution,
  unlikeContribution,
} from './communityApi'

const row: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.5rem',
  alignItems: 'stretch',
  width: '100%',
}

const btn: CSSProperties = {
  border: '1px solid #d6d3d1',
  borderRadius: '0.5rem',
  padding: '0.55rem 0.85rem',
  background: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.875rem',
  minHeight: '44px',
  flex: '1 1 auto',
  touchAction: 'manipulation',
  boxSizing: 'border-box',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
}

const btnDanger: CSSProperties = { ...btn, borderColor: '#fca5a5', color: '#991b1b' }

const hint: CSSProperties = { fontSize: '0.8rem', color: '#78716c', margin: 0, lineHeight: 1.4 }

const errBox: CSSProperties = {
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
  width: '100%',
  boxSizing: 'border-box',
}

const panel: CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.65rem',
  padding: '0.75rem',
  borderRadius: '0.5rem',
  background: '#fafaf9',
  border: '1px solid #e7e5e4',
  width: '100%',
  boxSizing: 'border-box',
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

function ReportTurnstile({
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

  if (!TURNSTILE_SITE_KEY) {
    return <p style={hint}>CAPTCHA no configurado (falta VITE_TURNSTILE_SITE_KEY).</p>
  }
  return <div ref={ref} />
}

export interface CommunityActionsProps {
  contributionId: string
  authorAlias: string
  likedByMe: boolean
  likeCount: number
  onLikedChange: (next: { likedByMe: boolean; likeCount: number }) => void
  onHidden: () => void
}

export default function CommunityActions({
  contributionId,
  authorAlias,
  likedByMe,
  likeCount,
  onLikedChange,
  onHidden,
}: CommunityActionsProps) {
  const { status, profile } = useAuth()
  const myAlias = status === 'ready' ? profile?.alias : null
  const own = isOwnPost(authorAlias, myAlias)
  const mayLike = canToggleLike(authorAlias, myAlias)

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmHide, setConfirmHide] = useState(false)
  const [reportOpen, setReportOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [captcha, setCaptcha] = useState<string | null>(null)
  const [captchaKey, setCaptchaKey] = useState(0)
  const [reportOk, setReportOk] = useState(false)

  const onCaptcha = useCallback((token: string | null) => {
    setCaptcha(token)
  }, [])

  async function toggleLike() {
    if (!mayLike || busy) return
    setBusy(true)
    setError(null)
    try {
      if (likedByMe) await unlikeContribution(contributionId)
      else await likeContribution(contributionId)
      onLikedChange(applyLikeToggle(likedByMe, likeCount))
    } catch (e) {
      setError(communityErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function confirmHideAction() {
    if (!own || busy) return
    setBusy(true)
    setError(null)
    try {
      await hideContribution(contributionId)
      onHidden()
    } catch (e) {
      setError(communityErrorMessage(e))
    } finally {
      setBusy(false)
      setConfirmHide(false)
    }
  }

  async function submitReport(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await reportContribution(contributionId, reason, captcha)
      setReportOk(true)
      setReportOpen(false)
      setReason('')
      setCaptcha(null)
      setCaptchaKey((k) => k + 1)
    } catch (err) {
      setError(communityErrorMessage(err))
      setCaptchaKey((k) => k + 1)
      setCaptcha(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={row}>
        {status === 'anonymous' || status === 'loading' ? (
          <Link to="/acceso" style={{ ...btn, textDecoration: 'none' }}>
            Entrar para Me gusta
          </Link>
        ) : own ? (
          <button type="button" style={btn} disabled title="No puedes dar Me gusta a tu publicación">
            Me gusta (propia)
          </button>
        ) : (
          <button type="button" style={btn} disabled={busy || !mayLike} onClick={() => void toggleLike()}>
            {likedByMe ? 'Quitar Me gusta' : 'Me gusta'} · {likeCount}
          </button>
        )}

        {own && (
          <button
            type="button"
            style={btnDanger}
            disabled={busy}
            onClick={() => {
              setConfirmHide(true)
              setError(null)
            }}
          >
            Ocultar
          </button>
        )}

        <button
          type="button"
          style={btn}
          disabled={busy}
          onClick={() => {
            setReportOpen((v) => !v)
            setReportOk(false)
            setError(null)
          }}
        >
          Denunciar
        </button>
      </div>

      {confirmHide && (
        <div style={panel} role="dialog" aria-label="Confirmar ocultación">
          <p style={hint}>
            Si ocultas la publicación, dejará de verse en el feed y se revocarán los puntos asociados
            (10 o 20 según el tipo). Esta acción no se puede deshacer desde la app.
          </p>
          <div style={row}>
            <button type="button" style={btnDanger} disabled={busy} onClick={() => void confirmHideAction()}>
              {busy ? 'Ocultando…' : 'Confirmar ocultación'}
            </button>
            <button type="button" style={btn} disabled={busy} onClick={() => setConfirmHide(false)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {reportOpen && (
        <form style={panel} onSubmit={(ev) => void submitReport(ev)}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: '0.8rem', fontWeight: 600 }}>Motivo</span>
            <textarea
              value={reason}
              onChange={(ev) => setReason(ev.target.value)}
              rows={3}
              required
              style={{
                border: '1px solid #d6d3d1',
                borderRadius: '0.5rem',
                padding: '0.65rem',
                fontFamily: 'inherit',
                width: '100%',
                boxSizing: 'border-box',
                minHeight: '5rem',
                fontSize: '1rem',
              }}
            />
          </label>
          <ReportTurnstile onToken={onCaptcha} resetKey={captchaKey} />
          <button type="submit" style={{ ...btn, width: '100%' }} disabled={busy}>
            {busy ? 'Enviando…' : 'Enviar denuncia'}
          </button>
        </form>
      )}

      {reportOk && (
        <p style={hint} role="status">
          Denuncia recibida. El equipo la revisará; no se muestra el resultado.
        </p>
      )}

      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}
    </div>
  )
}
