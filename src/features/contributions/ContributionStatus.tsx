import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { useAuth } from '../identity/AuthPage'
import {
  uploadEvidence,
  type CaptureOrigin,
} from './contributionApi'
import {
  cancelContribution,
  getContribution,
  isTerminalStatus,
  provideEvidence,
  retryContribution,
  shouldPollStatus,
  statusErrorMessage,
  statusLabel,
  type OwnContribution,
} from './statusApi'

const POLL_MS = 4000

const card: CSSProperties = {
  padding: '1.25rem',
  borderRadius: '0.75rem',
  background: '#fff',
  border: '1px solid #e7e5e4',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.85rem',
}

const hint: CSSProperties = {
  fontSize: '0.85rem',
  color: '#78716c',
  lineHeight: 1.45,
  margin: 0,
}

const errBox: CSSProperties = {
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
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
  padding: '0.55rem 0.85rem',
  background: '#fff',
  color: '#44403c',
  fontWeight: 600,
  cursor: 'pointer',
  fontSize: '0.85rem',
}

const btnDanger: CSSProperties = {
  ...btnGhost,
  borderColor: '#fecaca',
  color: '#991b1b',
}

export default function ContributionStatus() {
  const { status: authStatus } = useAuth()
  const { id = '' } = useParams()
  const [item, setItem] = useState<OwnContribution | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [captureOrigin, setCaptureOrigin] = useState<CaptureOrigin>('CAMERA_FLOW')

  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return
      try {
        const next = await getContribution(id, signal)
        setItem(next)
        setError(null)
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return
        // Fallo de red/404: error técnico, nunca APPROVED ficticio.
        setError(statusErrorMessage(e))
      }
    },
    [id],
  )

  useEffect(() => {
    if (authStatus !== 'ready' || !id) return
    const ctrl = new AbortController()
    // refresh() es async: setState tras await, no síncrono en el efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del estado
    void refresh(ctrl.signal)
    return () => ctrl.abort()
  }, [authStatus, id, refresh])

  useEffect(() => {
    if (!item || !shouldPollStatus(item.status)) return
    const timer = window.setInterval(() => {
      void refresh()
    }, POLL_MS)
    return () => window.clearInterval(timer)
  }, [item, refresh])

  if (authStatus === 'loading') {
    return <p style={{ textAlign: 'center', color: '#78716c' }}>Cargando sesión…</p>
  }
  if (authStatus !== 'ready') {
    return <Navigate to="/acceso" replace state={{ from: `/contribuciones/${id}` }} />
  }

  async function onRetry() {
    if (!id || !item || isTerminalStatus(item.status) || !item.canRetry) return
    setBusy(true)
    setError(null)
    try {
      setItem(await retryContribution(id))
    } catch (e) {
      setError(statusErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onCancel() {
    if (!id || !item || isTerminalStatus(item.status) || !item.canCancel) return
    if (!window.confirm('¿Cancelar este envío? No se otorgarán puntos.')) return
    setBusy(true)
    setError(null)
    try {
      setItem(await cancelContribution(id))
    } catch (e) {
      setError(statusErrorMessage(e))
    } finally {
      setBusy(false)
    }
  }

  async function onEvidence(e: FormEvent) {
    e.preventDefault()
    if (!id || !item || isTerminalStatus(item.status) || !item.canProvideEvidence) return
    if (!file) {
      setError('Elige una foto nueva (preferible con la cámara).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const photoPath = await uploadEvidence(file)
      setItem(await provideEvidence(id, photoPath, captureOrigin))
      setFile(null)
    } catch (err) {
      setError(statusErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section style={card}>
      <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Estado de la contribución</h1>
      <p style={hint}>
        ID: <code style={{ fontSize: '0.8rem' }}>{id}</code>
      </p>

      {!item && !error && (
        <p style={hint}>Consultando estado…</p>
      )}

      {item && (
        <>
          <p style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
            {statusLabel(item.status)}
          </p>
          {item.reason && <p style={hint}>Motivo: {item.reason}</p>}
          <p style={hint}>
            Enviada: {new Date(item.submittedAt).toLocaleString('es-ES')}
            {item.approvedAt
              ? ` · Aprobada: ${new Date(item.approvedAt).toLocaleString('es-ES')}`
              : ''}
          </p>
          <p style={hint}>
            Puntos efectivos (servidor): <strong>{item.effectivePoints}</strong> — el cliente no
            suma puntos. Polling activo solo en estados no finales.
          </p>

          {!isTerminalStatus(item.status) && item.canProvideEvidence && (
            <form onSubmit={(ev) => void onEvidence(ev)} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.875rem', fontWeight: 600 }}>Aportar evidencia</span>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <label style={{ ...btnGhost, cursor: 'pointer' }}>
                  Cámara
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    capture="environment"
                    style={{ display: 'none' }}
                    onChange={(ev) => {
                      setFile(ev.target.files?.[0] ?? null)
                      setCaptureOrigin('CAMERA_FLOW')
                    }}
                  />
                </label>
                <label style={{ ...btnGhost, cursor: 'pointer' }}>
                  Galería
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    style={{ display: 'none' }}
                    onChange={(ev) => {
                      setFile(ev.target.files?.[0] ?? null)
                      setCaptureOrigin('GALLERY')
                    }}
                  />
                </label>
              </div>
              {file && <p style={hint}>{file.name}</p>}
              <button type="submit" style={btnPrimary} disabled={busy}>
                {busy ? 'Enviando…' : 'Enviar evidencia'}
              </button>
            </form>
          )}

          {!isTerminalStatus(item.status) && (
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              {item.canRetry && (
                <button type="button" style={btnPrimary} disabled={busy} onClick={() => void onRetry()}>
                  Reintentar
                </button>
              )}
              {item.canCancel && (
                <button type="button" style={btnDanger} disabled={busy} onClick={() => void onCancel()}>
                  Cancelar envío
                </button>
              )}
            </div>
          )}
        </>
      )}

      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}

      <Link to="/contribuir" style={{ ...btnGhost, textDecoration: 'none', display: 'inline-block' }}>
        Nueva contribución
      </Link>
    </section>
  )
}
