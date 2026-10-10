import { useState } from 'react';
import { Link } from 'react-router-dom';
import { resolveMediaUrl } from '@/lib/api';
import { ACTION_LABELS, type FeedItem } from '@/lib/types';
import { useAuth } from '@/features/identity/AuthContext';
import { Alert, Button, PageTitle, Spinner } from '@/shared/ui';
import { usePaged } from '@/shared/usePaged';
import { communityErrorMessage, getFeed } from './communityApi';
import { HideDialog, LikeButton, ReportDialog } from './CommunityActions';

function timeAgo(iso: string): string {
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return `hace ${d} ${d === 1 ? 'día' : 'días'}`;
}

function FeedCard({ item, isOwn, canAct, onReport, onHide }: {
  item: FeedItem;
  isOwn: boolean;
  canAct: boolean;
  onReport: () => void;
  onHide: () => void;
}) {
  const action = ACTION_LABELS[item.actionType];
  return (
    <article className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200">
      <header className="flex items-center justify-between gap-2 px-4 py-3">
        <div className="min-w-0">
          <p className="truncate font-semibold">@{item.authorAlias}</p>
          <p className="truncate text-xs text-stone-500">📍 {item.municipality.name} · {timeAgo(item.publishedAt)}</p>
        </div>
        <span className="shrink-0 rounded-full bg-brand-50 px-2.5 py-1 text-xs font-semibold text-brand-800">
          {action.emoji} {action.label}
        </span>
      </header>
      <img src={resolveMediaUrl(item.imageUrl)} alt={`Foto de ${action.label.toLowerCase()} de @${item.authorAlias}`} loading="lazy" className="aspect-[4/3] w-full bg-stone-100 object-cover" />
      <div className="space-y-3 px-4 py-3">
        <p className="whitespace-pre-line text-sm text-stone-800">{item.description}</p>
        <div className="flex items-center justify-between">
          <LikeButton item={item} isOwn={isOwn} canAct={canAct} />
          <div className="flex gap-1 text-xs">
            {isOwn && (
              <button type="button" onClick={onHide} className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100">
                Ocultar
              </button>
            )}
            {!isOwn && (
              <button type="button" onClick={onReport} className="rounded-lg px-2 py-1 text-stone-500 hover:bg-stone-100">
                Denunciar
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export default function FeedPage() {
  const { status: authStatus, profile } = useAuth();
  const { items, setItems, hasMore, status, error, loadMore, reload } = usePaged(getFeed);
  const [reporting, setReporting] = useState<FeedItem | null>(null);
  const [hiding, setHiding] = useState<FeedItem | null>(null);
  const canAct = authStatus === 'ready';

  return (
    <>
      <PageTitle title="Acciones de la comunidad" subtitle="Acciones validadas de los últimos 30 días, ordenadas por Me gusta." />

      {authStatus === 'anonymous' && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-2xl bg-brand-700 p-4 text-white">
          <p className="text-sm">¿Has reciclado o recogido basura hoy? Regístralo y suma puntos.</p>
          <Link to="/acceso" className="shrink-0 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-brand-800">Participar</Link>
        </div>
      )}

      {status === 'loading' && <Spinner label="Cargando el feed…" />}
      {status === 'error' && items.length === 0 && (
        <div className="space-y-3">
          <Alert tone="error">No se pudo cargar el feed. {communityErrorMessage(error)}</Alert>
          <Button variant="secondary" onClick={reload}>Reintentar</Button>
        </div>
      )}
      {status !== 'loading' && status !== 'error' && items.length === 0 && (
        <Alert tone="info">Todavía no hay acciones publicadas. ¡Sé la primera persona!</Alert>
      )}

      <div className="space-y-4">
        {items.map((item) => (
          <FeedCard
            key={item.id}
            item={item}
            isOwn={canAct && profile?.alias === item.authorAlias}
            canAct={canAct}
            onReport={() => setReporting(item)}
            onHide={() => setHiding(item)}
          />
        ))}
      </div>

      {hasMore && (
        <div className="mt-6 text-center">
          <Button variant="secondary" disabled={status === 'loading-more'} onClick={() => void loadMore()}>
            {status === 'loading-more' ? 'Cargando…' : 'Ver más'}
          </Button>
        </div>
      )}

      {reporting && <ReportDialog item={reporting} onClose={() => setReporting(null)} />}
      {hiding && (
        <HideDialog
          item={hiding}
          onClose={() => setHiding(null)}
          onHidden={() => {
            setItems((prev) => prev.filter((i) => i.id !== hiding.id));
            setHiding(null);
          }}
        />
      )}
    </>
  );
}
