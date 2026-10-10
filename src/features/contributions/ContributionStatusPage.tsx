import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ApiError, newIdempotencyKey } from '@/lib/api';
import { ACTION_LABELS, type ContributionStatus, type OwnContribution } from '@/lib/types';
import { Alert, Button, Card, PageTitle, Spinner } from '@/shared/ui';
import {
  cancelContribution,
  contributionErrorMessage,
  getContribution,
  provideEvidence,
  retryContribution,
  uploadEvidence,
} from './contributionApi';
import PhotoPicker, { type PickedPhoto } from './PhotoPicker';

const POLL_MS = 3000;

const STATUS_VIEW: Record<ContributionStatus, { title: string; tone: 'info' | 'success' | 'warning' | 'error'; icon: string }> = {
  PENDING: { title: 'Validando tu acción…', tone: 'info', icon: '⏳' },
  APPROVED: { title: '¡Acción aprobada!', tone: 'success', icon: '✅' },
  NEEDS_EVIDENCE: { title: 'Necesitamos otra foto', tone: 'warning', icon: '📷' },
  TECHNICAL_ERROR: { title: 'No se pudo validar todavía', tone: 'warning', icon: '⚠️' },
  REJECTED: { title: 'Acción no aprobada', tone: 'error', icon: '❌' },
  CANCELLED: { title: 'Contribución cancelada', tone: 'info', icon: '🚫' },
};

type Command = 'evidence' | 'retry' | 'cancel';

export default function ContributionStatusPage() {
  const { id = '' } = useParams();
  const [data, setData] = useState<OwnContribution | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<Command | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const keys = useRef<Partial<Record<Command, string>>>({});

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        setData(await getContribution(id, signal));
        setLoadError(null);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setLoadError(e instanceof ApiError && e.status === 404 ? 'No encontramos esta contribución.' : contributionErrorMessage(e));
      }
    },
    [id],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    // load() es asíncrono: el setState ocurre tras la respuesta del API.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  // Solo se consulta mientras el servidor está procesando; nunca se asume un resultado.
  const pending = data?.status === 'PENDING';
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(timer);
  }, [pending, load]);

  async function run(cmd: Command) {
    setActionError(null);
    setBusy(cmd);
    // Misma clave mientras el usuario reintenta el mismo comando tras un fallo.
    const key = (keys.current[cmd] ??= newIdempotencyKey());
    try {
      let next: OwnContribution;
      if (cmd === 'evidence') {
        if (!photo) return;
        const photoPath = await uploadEvidence(photo.file);
        next = await provideEvidence(id, photoPath, photo.origin, key);
        setPhoto(null);
      } else if (cmd === 'retry') {
        next = await retryContribution(id, key);
      } else {
        next = await cancelContribution(id, key);
        setConfirmCancel(false);
      }
      delete keys.current[cmd];
      setData(next);
    } catch (e) {
      setActionError(contributionErrorMessage(e));
      if (e instanceof ApiError && e.code === 'INVALID_STATE') {
        delete keys.current[cmd];
        void load();
      }
    } finally {
      setBusy(null);
    }
  }

  if (loadError && !data) {
    return (
      <>
        <PageTitle title="Estado de tu contribución" />
        <Alert tone="error">{loadError}</Alert>
        <Link to="/contribuir" className="mt-4 inline-block text-sm text-brand-700 underline">Volver</Link>
      </>
    );
  }
  if (!data) return <Spinner />;

  const view = STATUS_VIEW[data.status];
  const action = ACTION_LABELS[data.actionType];

  return (
    <>
      <PageTitle title="Estado de tu contribución" subtitle={`${action.emoji} ${action.label} · enviada a las ${new Date(data.submittedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`} />

      <Card className="space-y-4">
        <div className="flex items-center gap-3">
          <span className={`text-4xl ${pending ? 'animate-pulse' : ''}`} aria-hidden>{view.icon}</span>
          <div>
            <h2 className="text-lg font-bold">{data.isHidden ? 'Publicación oculta' : view.title}</h2>
            {data.status === 'APPROVED' && !data.isHidden && (
              <p className="font-semibold text-brand-700">+{data.effectivePoints} puntos · ya está publicada en el feed</p>
            )}
            {data.isHidden && <p className="text-sm text-stone-600">La ocultaste y sus puntos se retiraron.</p>}
            {pending && <p className="text-sm text-stone-600">Puede tardar unos segundos. Puedes seguir navegando.</p>}
          </div>
        </div>

        {data.reason && data.status !== 'PENDING' && (
          <Alert tone={view.tone}>
            <strong>Motivo:</strong> {data.reason}
          </Alert>
        )}

        {data.canProvideEvidence && (
          <div className="space-y-3 border-t border-stone-100 pt-4">
            <p className="text-sm font-medium">Aporta una nueva foto para la misma acción:</p>
            <PhotoPicker value={photo} onChange={setPhoto} />
            <Button className="w-full" disabled={!photo || busy !== null} onClick={() => void run('evidence')}>
              {busy === 'evidence' ? 'Enviando…' : 'Enviar nueva foto'}
            </Button>
          </div>
        )}

        {data.canRetry && (
          <Button className="w-full" disabled={busy !== null} onClick={() => void run('retry')}>
            {busy === 'retry' ? 'Reintentando…' : 'Reintentar validación'}
          </Button>
        )}

        {data.canCancel &&
          (confirmCancel ? (
            <div className="space-y-2 rounded-xl bg-stone-50 p-3">
              <p className="text-sm">¿Cancelar esta contribución? No sumará puntos y podrás enviar otra.</p>
              <div className="flex gap-2">
                <Button variant="danger" disabled={busy !== null} onClick={() => void run('cancel')}>
                  {busy === 'cancel' ? 'Cancelando…' : 'Sí, cancelar'}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmCancel(false)}>No</Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" className="w-full" disabled={busy !== null} onClick={() => setConfirmCancel(true)}>
              Cancelar contribución
            </Button>
          ))}

        {actionError && <Alert tone="error">{actionError}</Alert>}
        {loadError && <Alert tone="warning">No se pudo actualizar el estado: {loadError}</Alert>}
      </Card>

      <div className="mt-4 flex gap-4 text-sm">
        <Link to="/" className="text-brand-700 underline">Ver el feed</Link>
        {['APPROVED', 'REJECTED', 'CANCELLED'].includes(data.status) && (
          <Link to="/contribuir" className="text-brand-700 underline">Registrar otra acción</Link>
        )}
      </div>
    </>
  );
}
