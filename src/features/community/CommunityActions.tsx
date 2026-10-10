import { useState, type FormEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { TURNSTILE_SITE_KEY } from '@/lib/config';
import { ACTION_LABELS, type FeedItem } from '@/lib/types';
import Turnstile from '@/shared/Turnstile';
import { Alert, Button, inputClass } from '@/shared/ui';
import { communityErrorMessage, hideContribution, setLike, submitReport } from './communityApi';

export function LikeButton({ item, isOwn, canAct }: { item: FeedItem; isOwn: boolean; canAct: boolean }) {
  const navigate = useNavigate();
  const [liked, setLiked] = useState(item.likedByMe);
  const [count, setCount] = useState(item.likeCount);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    if (!canAct) return navigate('/acceso');
    const next = !liked;
    setBusy(true);
    setError(null);
    // Optimista solo para el contador de Me gusta, que nunca afecta a puntos.
    setLiked(next);
    setCount((c) => c + (next ? 1 : -1));
    try {
      await setLike(item.id, next);
    } catch (e) {
      setLiked(!next);
      setCount((c) => c + (next ? -1 : 1));
      setError(communityErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => void toggle()}
        disabled={busy || isOwn}
        aria-pressed={liked}
        title={isOwn ? 'No puedes dar Me gusta a tu publicación' : liked ? 'Quitar Me gusta' : 'Me gusta'}
        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium ring-1 transition ${
          liked ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-white text-stone-600 ring-stone-200 hover:bg-stone-50'
        } disabled:cursor-default disabled:opacity-60`}
      >
        <span aria-hidden>{liked ? '❤️' : '🤍'}</span> {count}
      </button>
      {error && <span className="text-xs text-red-700">{error}</span>}
    </span>
  );
}

export function ReportDialog({ item, onClose }: { item: FeedItem; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!token) return setError(TURNSTILE_SITE_KEY ? 'Completa la verificación anti-bots.' : 'La verificación anti-bots no está disponible.');
    setState('sending');
    setError(null);
    try {
      await submitReport(item.id, reason.trim(), token);
      setState('sent');
    } catch (err) {
      setError(communityErrorMessage(err));
      setState('idle');
      setToken(null);
      setCaptchaKey((k) => k + 1);
    }
  }

  return (
    <Modal onClose={onClose} title="Denunciar publicación">
      {state === 'sent' ? (
        <div className="space-y-4">
          <Alert tone="success">Gracias. El equipo revisará la denuncia.</Alert>
          <Button className="w-full" onClick={onClose}>Cerrar</Button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <p className="text-sm text-stone-600">No necesitas cuenta. Indica el motivo (p. ej. aparece una persona identificable, contenido inapropiado, no es una acción real).</p>
          <textarea className={`${inputClass} min-h-24`} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required placeholder="Motivo de la denuncia" />
          <Turnstile key={captchaKey} onToken={setToken} />
          {error && <Alert tone="error">{error}</Alert>}
          <div className="flex gap-2">
            <Button type="submit" variant="danger" disabled={state === 'sending' || !reason.trim()} className="flex-1">
              {state === 'sending' ? 'Enviando…' : 'Enviar denuncia'}
            </Button>
            <Button type="button" variant="ghost" onClick={onClose}>Cancelar</Button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function HideDialog({ item, onClose, onHidden }: { item: FeedItem; onClose: () => void; onHidden: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const points = ACTION_LABELS[item.actionType].points;

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      await hideContribution(item.id);
      onHidden();
    } catch (e) {
      setError(communityErrorMessage(e));
      setBusy(false);
    }
  }

  return (
    <Modal onClose={onClose} title="Ocultar publicación">
      <div className="space-y-4">
        <Alert tone="warning">
          Si la ocultas, desaparecerá del feed y <strong>perderás los {points} puntos</strong> que te dio. No se puede deshacer.
        </Alert>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button variant="danger" className="flex-1" disabled={busy} onClick={() => void confirm()}>
            {busy ? 'Ocultando…' : `Ocultar y perder ${points} puntos`}
          </Button>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
        </div>
      </div>
    </Modal>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-3 text-lg font-bold">{title}</h2>
        {children}
      </div>
    </div>
  );
}
