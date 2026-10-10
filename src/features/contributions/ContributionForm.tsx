import { useEffect, useState, type CSSProperties, type FormEvent } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { useAuth } from '../identity/AuthPage'
import {
  clearIdempotencyKey,
  contributionErrorMessage,
  createContribution,
  getOrCreateIdempotencyKey,
  searchMunicipalities,
  uploadEvidence,
  validateDescription,
  type ActionType,
  type CaptureOrigin,
  type Municipality,
} from './contributionApi'

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
  padding: '0.65rem 1rem',
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

const infoBox: CSSProperties = {
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: '#f0fdf4',
  color: '#166534',
  fontSize: '0.85rem',
}

export default function ContributionForm() {
  const { status } = useAuth()
  const navigate = useNavigate()

  const [actionType, setActionType] = useState<ActionType>('RECYCLING')
  const [description, setDescription] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [captureOrigin, setCaptureOrigin] = useState<CaptureOrigin>('GALLERY')
  const [muniQuery, setMuniQuery] = useState('')
  const [muniOptions, setMuniOptions] = useState<Municipality[]>([])
  const [municipality, setMunicipality] = useState<Municipality | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const q = muniQuery.trim()
    if (q.length < 2) return
    const ctrl = new AbortController()
    const t = window.setTimeout(() => {
      void searchMunicipalities(q, ctrl.signal)
        .then(setMuniOptions)
        .catch((e) => {
          if (e instanceof DOMException && e.name === 'AbortError') return
          setMuniOptions([])
        })
    }, 250)
    return () => {
      ctrl.abort()
      window.clearTimeout(t)
    }
  }, [muniQuery])

  if (status === 'loading') {
    return <p style={{ textAlign: 'center', color: '#78716c' }}>Cargando sesión…</p>
  }
  if (status !== 'ready') {
    return <Navigate to="/acceso" replace state={{ from: '/contribuir' }} />
  }

  function onPickFile(next: FileList | null, origin: CaptureOrigin) {
    const chosen = next?.[0] ?? null
    setFile(chosen)
    setCaptureOrigin(origin)
    setError(null)
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    try {
      const desc = validateDescription(description)
      if (!file) throw new Error('Añade una foto desde la cámara o la galería.')
      if (!municipality) throw new Error('Selecciona un municipio de la lista.')

      setBusy(true)
      const photoPath = await uploadEvidence(file)
      const idempotencyKey = getOrCreateIdempotencyKey(actionType)
      const created = await createContribution(
        {
          actionType,
          description: desc,
          municipalityCode: municipality.code,
          photoPath,
          captureOrigin,
        },
        idempotencyKey,
      )
      clearIdempotencyKey(actionType)
      navigate(`/contribuciones/${created.id}`, { replace: true })
    } catch (err) {
      setError(contributionErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form style={card} onSubmit={(ev) => void submit(ev)}>
      <h1 style={{ margin: 0, fontSize: '1.35rem' }}>Nueva contribución</h1>
      <p style={hint}>
        Subiremos la foto de forma privada y el servidor decidirá el resultado. Los puntos
        informativos no se otorgan en el navegador.
      </p>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: 6 }}>Acción</legend>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <button
            type="button"
            style={actionType === 'RECYCLING' ? btnPrimary : btnGhost}
            onClick={() => setActionType('RECYCLING')}
          >
            Reciclaje (10 pts si se aprueba)
          </button>
          <button
            type="button"
            style={actionType === 'LITTER_COLLECTION' ? btnPrimary : btnGhost}
            onClick={() => setActionType('LITTER_COLLECTION')}
          >
            Recogida (20 pts si se aprueba)
          </button>
        </div>
      </fieldset>

      <label>
        <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
          Descripción
        </span>
        <textarea
          style={{ ...inputStyle, minHeight: '5rem', resize: 'vertical' }}
          value={description}
          onChange={(ev) => setDescription(ev.target.value)}
          maxLength={500}
          required
        />
        <span style={hint}>{description.trim().length}/500</span>
      </label>

      <div>
        <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
          Foto
        </span>
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <label style={{ ...btnGhost, cursor: 'pointer' }}>
            Cámara
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              capture="environment"
              style={{ display: 'none' }}
              onChange={(ev) => onPickFile(ev.target.files, 'CAMERA_FLOW')}
            />
          </label>
          <label style={{ ...btnGhost, cursor: 'pointer' }}>
            Galería
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              style={{ display: 'none' }}
              onChange={(ev) => onPickFile(ev.target.files, 'GALLERY')}
            />
          </label>
        </div>
        {file && (
          <p style={{ ...hint, marginTop: 6 }}>
            {file.name} · {(file.size / 1024).toFixed(0)} KB · origen {captureOrigin}
          </p>
        )}
      </div>

      <div>
        <label>
          <span style={{ display: 'block', marginBottom: 4, fontSize: '0.875rem', fontWeight: 600 }}>
            Municipio (INE)
          </span>
          <input
            style={inputStyle}
            value={municipality ? `${municipality.name} (${municipality.code})` : muniQuery}
            onChange={(ev) => {
              setMunicipality(null)
              setMuniOptions([])
              setMuniQuery(ev.target.value)
            }}
            placeholder="Escribe al menos 2 caracteres"
            autoComplete="off"
          />
        </label>
        {muniQuery.trim().length >= 2 && muniOptions.length > 0 && !municipality && (
          <ul
            style={{
              listStyle: 'none',
              margin: '0.35rem 0 0',
              padding: 0,
              border: '1px solid #e7e5e4',
              borderRadius: '0.5rem',
              maxHeight: '10rem',
              overflow: 'auto',
            }}
          >
            {muniOptions.map((m) => (
              <li key={m.code}>
                <button
                  type="button"
                  style={{
                    width: '100%',
                    textAlign: 'left',
                    border: 'none',
                    background: 'transparent',
                    padding: '0.5rem 0.75rem',
                    cursor: 'pointer',
                  }}
                  onClick={() => {
                    setMunicipality(m)
                    setMuniQuery('')
                    setMuniOptions([])
                  }}
                >
                  {m.name} · {m.code}
                </button>
              </li>
            ))}
          </ul>
        )}
        <span style={hint}>Beta: catálogo de la provincia de Barcelona vía API.</span>
      </div>

      <div style={infoBox} role="note">
        Si el envío falla por cooldown, EXIF o contribución pendiente, verás el motivo aquí. No hay
        aprobación simulada.
      </div>

      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}

      <button type="submit" style={btnPrimary} disabled={busy}>
        {busy ? 'Enviando…' : 'Enviar contribución'}
      </button>
    </form>
  )
}
