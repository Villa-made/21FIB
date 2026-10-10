import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import {
  fetchFeed,
  mediaSrc,
  readErrorMessage,
  areDevFixturesEnabled,
  type FeedItem,
} from './readApi'

const card: CSSProperties = {
  padding: '1rem',
  borderRadius: '0.75rem',
  background: '#fff',
  border: '1px solid #e7e5e4',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
}

const hint: CSSProperties = { fontSize: '0.8rem', color: '#78716c', margin: 0, lineHeight: 1.4 }

const errBox: CSSProperties = {
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
}

const btn: CSSProperties = {
  border: '1px solid #d6d3d1',
  borderRadius: '0.5rem',
  padding: '0.55rem 0.85rem',
  background: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
}

function actionLabel(t: FeedItem['actionType']): string {
  return t === 'RECYCLING' ? 'Reciclaje' : 'Recogida'
}

export default function FeedPage() {
  const [items, setItems] = useState<FeedItem[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (nextCursor?: string | null, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await fetchFeed(20, nextCursor ?? null)
      setItems((prev) => (append ? [...prev, ...page.items] : page.items))
      setCursor(page.nextCursor)
      setError(null)
    } catch (e) {
      setError(readErrorMessage(e))
      if (!append) setItems([])
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del feed
    void load(null, false)
  }, [load])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header>
        <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem' }}>Feed</h1>
        <p style={hint}>
          Publicaciones aprobadas (últimos 30 días). Lectura pública; sin emails ni rutas privadas.
          {areDevFixturesEnabled() ? ' · Fixtures DEV activos' : ''}
        </p>
      </header>

      {loading && <p style={hint}>Cargando…</p>}

      {error && (
        <div style={errBox} role="alert">
          {error}
        </div>
      )}

      {!loading && !error && items.length === 0 && (
        <p style={hint}>No hay publicaciones visibles todavía.</p>
      )}

      {items.map((item) => (
        <article key={item.id} style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '0.5rem' }}>
            <strong>@{item.authorAlias}</strong>
            <span style={hint}>{actionLabel(item.actionType)}</span>
          </div>
          <p style={{ margin: 0, color: '#44403c' }}>{item.description}</p>
          <p style={hint}>
            {item.municipality.name} ({item.municipality.code}) ·{' '}
            {new Date(item.publishedAt).toLocaleString('es-ES')}
          </p>
          <img
            src={mediaSrc(item.imageUrl)}
            alt=""
            style={{
              width: '100%',
              maxHeight: '16rem',
              objectFit: 'cover',
              borderRadius: '0.5rem',
              background: '#f5f5f4',
            }}
            onError={(ev) => {
              ;(ev.target as HTMLImageElement).style.display = 'none'
            }}
          />
          <p style={hint}>
            {item.likeCount} me gusta
            {item.likedByMe ? ' · te gusta' : ''}
          </p>
        </article>
      ))}

      {cursor && (
        <button
          type="button"
          style={btn}
          disabled={loadingMore}
          onClick={() => void load(cursor, true)}
        >
          {loadingMore ? 'Cargando…' : 'Ver más'}
        </button>
      )}
    </div>
  )
}
