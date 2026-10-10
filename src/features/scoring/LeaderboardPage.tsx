import { getLeaderboard, communityErrorMessage } from '@/features/community/communityApi';
import { useAuth } from '@/features/identity/AuthContext';
import { Alert, Button, Card, PageTitle, Spinner } from '@/shared/ui';
import { usePaged } from '@/shared/usePaged';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

export default function LeaderboardPage() {
  const { profile } = useAuth();
  const { items, hasMore, status, error, loadMore, reload } = usePaged(getLeaderboard);

  return (
    <>
      <PageTitle title="Ranking global" subtitle="Puntos de acciones validadas y visibles. Reciclar +10 · Recoger residuos +20. Los Me gusta no puntúan." />

      {status === 'loading' && <Spinner label="Cargando el ranking…" />}
      {status === 'error' && items.length === 0 && (
        <div className="space-y-3">
          <Alert tone="error">No se pudo cargar el ranking. {communityErrorMessage(error)}</Alert>
          <Button variant="secondary" onClick={reload}>Reintentar</Button>
        </div>
      )}
      {status === 'ready' && items.length === 0 && <Alert tone="info">Aún no hay puntuaciones.</Alert>}

      {items.length > 0 && (
        <Card className="!p-0">
          <ol className="divide-y divide-stone-100">
            {items.map((e) => {
              const me = profile?.userId === e.userId;
              return (
                <li key={e.userId} className={`flex items-center gap-3 px-4 py-3 ${me ? 'bg-brand-50' : ''}`}>
                  <span className="w-8 text-center text-lg font-bold text-stone-500">{MEDALS[e.rank] ?? e.rank}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    @{e.alias} {me && <span className="text-xs font-semibold text-brand-700">(tú)</span>}
                  </span>
                  <span className="font-bold tabular-nums text-brand-700">{e.points} pts</span>
                </li>
              );
            })}
          </ol>
        </Card>
      )}

      {hasMore && (
        <div className="mt-6 text-center">
          <Button variant="secondary" disabled={status === 'loading-more'} onClick={() => void loadMore()}>
            {status === 'loading-more' ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      )}
    </>
  );
}
