import { useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { newIdempotencyKey } from '@/lib/api';
import { ACTION_LABELS, type ActionType, type Municipality } from '@/lib/types';
import { Alert, Button, Card, PageTitle, inputClass } from '@/shared/ui';
import { contributionErrorMessage, createContribution, uploadEvidence } from './contributionApi';
import MunicipalityPicker from './MunicipalityPicker';
import PhotoPicker, { type PickedPhoto } from './PhotoPicker';
import { addRecent, getRecent } from './recent';

const MAX_DESCRIPTION = 500;

export default function ContributionPage() {
  const navigate = useNavigate();
  const [actionType, setActionType] = useState<ActionType | null>(null);
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [municipality, setMunicipality] = useState<Municipality | null>(null);
  const [description, setDescription] = useState('');
  const [step, setStep] = useState<'idle' | 'uploading' | 'sending'>('idle');
  const [error, setError] = useState<string | null>(null);

  // Reintentos de la misma intención reutilizan foto subida y clave de idempotencia.
  const uploaded = useRef<{ file: File; photoPath: string } | null>(null);
  const intent = useRef<{ signature: string; key: string } | null>(null);
  const recent = getRecent().slice(0, 3);

  const ready = actionType && photo && municipality && description.trim().length > 0;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!ready) return setError('Completa todos los campos.');
    setError(null);
    try {
      let photoPath = uploaded.current?.file === photo.file ? uploaded.current.photoPath : null;
      if (!photoPath) {
        setStep('uploading');
        photoPath = await uploadEvidence(photo.file);
        uploaded.current = { file: photo.file, photoPath };
      }
      const request = {
        actionType,
        description: description.trim(),
        municipalityCode: municipality.code,
        photoPath,
        captureOrigin: photo.origin,
      };
      const signature = JSON.stringify(request);
      if (intent.current?.signature !== signature) intent.current = { signature, key: newIdempotencyKey() };

      setStep('sending');
      const res = await createContribution(request, intent.current.key);
      addRecent({ id: res.id, actionType, submittedAt: res.submittedAt });
      navigate(`/contribuciones/${res.id}`);
    } catch (err) {
      setError(contributionErrorMessage(err));
    } finally {
      setStep('idle');
    }
  }

  return (
    <>
      <PageTitle title="Registrar una acción" subtitle="Sube una foto de lo que has hecho. Una IA la revisa y, si es coherente, ganas puntos." />

      {recent.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-2 text-xs">
          <span className="text-stone-500">Tus envíos recientes:</span>
          {recent.map((r) => (
            <Link key={r.id} to={`/contribuciones/${r.id}`} className="rounded-full bg-white px-2.5 py-1 ring-1 ring-stone-200 hover:bg-stone-100">
              {ACTION_LABELS[r.actionType as ActionType]?.emoji} {new Date(r.submittedAt).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}
            </Link>
          ))}
        </div>
      )}

      <form onSubmit={submit} className="space-y-5">
        <section>
          <h2 className="mb-2 text-sm font-semibold">1. ¿Qué has hecho?</h2>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Tipo de acción">
            {(Object.keys(ACTION_LABELS) as ActionType[]).map((t) => {
              const a = ACTION_LABELS[t];
              const selected = actionType === t;
              return (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setActionType(t)}
                  className={`rounded-2xl p-4 text-left ring-2 transition ${selected ? 'bg-brand-50 ring-brand-600' : 'bg-white ring-stone-200 hover:ring-stone-300'}`}
                >
                  <span className="block text-3xl" aria-hidden>{a.emoji}</span>
                  <span className="mt-1 block font-semibold">{a.label}</span>
                  <span className="text-sm text-brand-700">+{a.points} puntos</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">2. Foto de la acción</h2>
          <PhotoPicker value={photo} onChange={setPhoto} />
          <p className="mt-2 text-xs text-stone-500">Evita que se reconozca a otras personas o matrículas.</p>
        </section>

        <section>
          <h2 className="mb-2 text-sm font-semibold">3. ¿Dónde?</h2>
          <MunicipalityPicker value={municipality} onChange={setMunicipality} />
        </section>

        <section>
          <label htmlFor="description" className="mb-2 block text-sm font-semibold">4. Descríbelo brevemente</label>
          <textarea
            id="description"
            className={`${inputClass} min-h-24`}
            value={description}
            maxLength={MAX_DESCRIPTION}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="p. ej. He recogido latas y plásticos en el parque"
            required
          />
          <p className="mt-1 text-right text-xs text-stone-400">{description.length}/{MAX_DESCRIPTION}</p>
        </section>

        {error && <Alert tone="error">{error}</Alert>}

        <Card className="!p-3 text-xs text-stone-600">
          La IA estima si la foto y la descripción son coherentes; no certifica la acción. Solo las acciones aprobadas suman puntos y se publican.
        </Card>

        <Button type="submit" disabled={!ready || step !== 'idle'} className="w-full py-3 text-base">
          {step === 'uploading' ? 'Subiendo foto…' : step === 'sending' ? 'Enviando…' : 'Enviar para validar'}
        </Button>
      </form>
    </>
  );
}
