import { useCallback, useEffect, useState, type CSSProperties } from 'react'
import { useAuth } from '../identity/AuthPage'
import {
  fetchLeaderboard,
  readErrorMessage,
  areDevFixturesEnabled,
  type LeaderboardEntry,
} from '../community/readApi'

const hint: CSSProperties = { fontSize: '0.8rem', color: '#78716c', margin: 0, lineHeight: 1.4 }

const errBox: CSSProperties = {
  padding: '0.65rem 0.75rem',
  borderRadius: '0.5rem',
  background: '#fef2f2',
  color: '#991b1b',
  fontSize: '0.875rem',
}

const table: CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  background: '#fff',
  borderRadius: '0.75rem',
  overflow: 'hidden',
  border: '1px solid #e7e5e4',
}

const thtd: CSSProperties = {
  padding: '0.65rem 0.75rem',
  textAlign: 'left',
  borderBottom: '1px solid #f5f5f4',
  fontSize: '0.9rem',
}

const btn: CSSProperties = {
  border: '1px solid #d6d3d1',
  borderRadius: '0.5rem',
  padding: '0.55rem 0.85rem',
  background: '#fff',
  fontWeight: 600,
  cursor: 'pointer',
}

export default function LeaderboardPage() {
  const { status, profile } = useAuth()
  const [items, setItems] = useState<LeaderboardEntry[]>([])
  const [cursor, setCursor] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)

  const load = useCallback(async (nextCursor?: string | null, append = false) => {
    if (append) setLoadingMore(true)
    else setLoading(true)
    try {
      const page = await fetchLeaderboard(20, nextCursor ?? null)
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
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial del ranking
    void load(null, false)
  }, [load])

  const myAlias = status === 'ready' ? profile?.alias : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <header>
        <h1 style={{ margin: '0 0 0.35rem', fontSize: '1.5rem' }}>Ranking</h1>
        <p style={hint}>
          Puntos derivados en servidor (empates comparten puesto). Lectura pública.
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
        <p style={hint}>Aún no hay puntuaciones públicas.</p>
      )}

      {items.length > 0 && (
        <table style={table}>
          <thead>
            <tr>
              <th style={thtd}>#</th>
              <th style={thtd}>Alias</th>
              <th style={{ ...thtd, textAlign: 'right' }}>Puntos</th>
            </tr>
          </thead>
          <tbody>
            {items.map((row) => {
              const mine = myAlias != null && row.alias === myAlias
              return (
                <tr
                  key={`${row.rank}-${row.userId}`}
                  style={mine ? { background: '#f0fdf4' } : undefined}
                >
                  <td style={thtd}>{row.rank}</td>
                  <td style={thtd}>
                    @{row.alias}
                    {mine ? ' (tú)' : ''}
                  </td>
                  <td style={{ ...thtd, textAlign: 'right', fontWeight: 700 }}>{row.points}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

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
