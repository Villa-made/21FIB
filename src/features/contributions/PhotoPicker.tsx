import { useEffect, useRef, useState } from 'react';
import type { CaptureOrigin } from '@/lib/types';
import { Alert } from '@/shared/ui';
import { ALLOWED_TYPES, MAX_PHOTO_BYTES } from './contributionApi';
import { checkGalleryDate, downscaleCameraPhoto, readExifDate } from './photo';

export interface PickedPhoto {
  file: File;
  origin: CaptureOrigin;
}

const GALLERY_ERRORS = {
  NO_EXIF: 'Esta foto no tiene fecha de captura. Haz una foto nueva con la cámara.',
  TOO_OLD: 'Esta foto se hizo hace más de 60 minutos. Haz una foto nueva con la cámara.',
  FUTURE: 'La fecha de esta foto no es válida. Haz una foto nueva con la cámara.',
} as const;

export default function PhotoPicker({ value, onChange }: { value: PickedPhoto | null; onChange: (p: PickedPhoto | null) => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    // Sincroniza con un recurso externo (object URL) que hay que revocar: patrón válido de efecto.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value.file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  async function handle(file: File | undefined, origin: CaptureOrigin) {
    setError(null);
    if (!file) return;
    if (!ALLOWED_TYPES.includes(file.type)) {
      return setError('Formato no admitido. Usa JPEG, PNG o WebP.');
    }
    setBusy(true);
    try {
      if (origin === 'GALLERY') {
        const check = checkGalleryDate(await readExifDate(file));
        if (!check.ok) return setError(GALLERY_ERRORS[check.reason]);
        if (file.size > MAX_PHOTO_BYTES) return setError('La imagen supera 5 MB. Haz una foto con la cámara desde aquí.');
        onChange({ file, origin });
      } else {
        const small = await downscaleCameraPhoto(file);
        if (small.size > MAX_PHOTO_BYTES) return setError('La imagen supera 5 MB.');
        onChange({ file: small, origin });
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        data-testid="camera-input"
        onChange={(e) => { void handle(e.target.files?.[0], 'CAMERA_FLOW'); e.target.value = ''; }}
      />
      <input
        ref={galleryRef}
        type="file"
        accept={ALLOWED_TYPES.join(',')}
        className="hidden"
        data-testid="gallery-input"
        onChange={(e) => { void handle(e.target.files?.[0], 'GALLERY'); e.target.value = ''; }}
      />

      {preview ? (
        <div className="relative overflow-hidden rounded-xl ring-1 ring-stone-200">
          <img src={preview} alt="Foto seleccionada" className="max-h-80 w-full object-cover" />
          <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">
            {value?.origin === 'CAMERA_FLOW' ? '📷 Cámara' : '🖼️ Galería'}
          </span>
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-0.5 text-sm text-white"
            aria-label="Quitar foto"
          >
            ✕
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => cameraRef.current?.click()}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-brand-500 bg-brand-50 px-3 py-6 text-sm font-semibold text-brand-800"
          >
            <span className="text-3xl" aria-hidden>📷</span> Hacer foto
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => galleryRef.current?.click()}
            className="flex flex-col items-center gap-1 rounded-xl border-2 border-dashed border-stone-300 bg-white px-3 py-6 text-sm font-semibold text-stone-700"
          >
            <span className="text-3xl" aria-hidden>🖼️</span> Galería
            <span className="text-xs font-normal text-stone-500">foto de hace ≤ 60 min</span>
          </button>
        </div>
      )}
      {busy && <p className="text-sm text-stone-500">Procesando foto…</p>}
      {error && <Alert tone="warning">{error}</Alert>}
    </div>
  );
}
