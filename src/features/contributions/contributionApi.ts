import { ApiError, apiRequest } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import type {
  CaptureOrigin,
  CreateContributionRequest,
  CreateContributionResponse,
  Municipality,
  OwnContribution,
  Page,
  UploadTicket,
} from '@/lib/types';

/** PROPUESTA A ACORDAR CON A: bucket privado de originales (data-model §1). */
export const EVIDENCE_BUCKET = 'evidence-private';
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
export const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export async function searchMunicipalities(q: string, signal?: AbortSignal): Promise<Municipality[]> {
  const page = await apiRequest<Page<Municipality>>('GET', `/v1/municipalities?q=${encodeURIComponent(q)}&limit=10`, { signal });
  return page.items;
}

/** Pide un token de subida y sube el archivo directamente al bucket privado. Devuelve `photoPath`. */
export async function uploadEvidence(file: File): Promise<string> {
  const ticket = await apiRequest<UploadTicket>('POST', '/v1/uploads', {
    auth: true,
    body: { contentType: file.type, sizeBytes: file.size },
  });
  if (USE_FIXTURES) {
    const { registerFixturePreview } = await import('@/lib/fixtures');
    registerFixturePreview(ticket.photoPath, URL.createObjectURL(file));
    return ticket.photoPath;
  }
  if (!supabase) throw new ApiError(0, 'NOT_CONFIGURED', 'La subida de fotos no está configurada.');
  const { error } = await supabase.storage
    .from(EVIDENCE_BUCKET)
    .uploadToSignedUrl(ticket.photoPath, ticket.uploadToken, file, { contentType: file.type });
  if (error) throw new ApiError(0, 'UPLOAD_FAILED', 'No se pudo subir la foto. Inténtalo de nuevo.');
  return ticket.photoPath;
}

export function createContribution(req: CreateContributionRequest, idempotencyKey: string) {
  return apiRequest<CreateContributionResponse>('POST', '/v1/contributions', { auth: true, body: req, idempotencyKey });
}

export function getContribution(id: string, signal?: AbortSignal) {
  return apiRequest<OwnContribution>('GET', `/v1/contributions/${encodeURIComponent(id)}`, { auth: true, signal });
}

export function provideEvidence(id: string, photoPath: string, captureOrigin: CaptureOrigin, idempotencyKey: string) {
  return apiRequest<OwnContribution>('POST', `/v1/contributions/${encodeURIComponent(id)}/evidence`, {
    auth: true,
    body: { photoPath, captureOrigin },
    idempotencyKey,
  });
}

export function retryContribution(id: string, idempotencyKey: string) {
  return apiRequest<OwnContribution>('POST', `/v1/contributions/${encodeURIComponent(id)}/retry`, { auth: true, body: {}, idempotencyKey });
}

export function cancelContribution(id: string, idempotencyKey: string) {
  return apiRequest<OwnContribution>('POST', `/v1/contributions/${encodeURIComponent(id)}/cancel`, { auth: true, body: {}, idempotencyKey });
}

/** Mensajes de los errores de dominio del contrato (api-contracts §6). */
export function contributionErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Ha ocurrido un error inesperado.';
  switch (e.code) {
    case 'AUTH_REQUIRED':
      return 'Tu sesión ha caducado. Vuelve a iniciar sesión.';
    case 'PENDING_CONTRIBUTION_EXISTS':
      return 'Ya tienes una contribución de este tipo en revisión. Espera el resultado o cancélala.';
    case 'COOLDOWN_ACTIVE': {
      const retryAt = typeof e.details.retryAt === 'string' ? new Date(e.details.retryAt) : null;
      return retryAt
        ? `Ya registraste esta acción hace poco. Podrás volver a hacerlo a las ${retryAt.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}.`
        : 'Ya registraste esta acción hace menos de 60 minutos.';
    }
    case 'EXIF_REQUIRED':
      return 'La foto de la galería no tiene fecha de captura. Haz una foto nueva con la cámara.';
    case 'PHOTO_TOO_OLD':
      return 'La foto se hizo hace más de 60 minutos. Haz una foto nueva con la cámara.';
    case 'INVALID_MUNICIPALITY':
      return 'Selecciona un municipio de la lista.';
    case 'INVALID_STATE':
      return 'Esta acción ya no está disponible para esta contribución.';
    case 'IDEMPOTENCY_CONFLICT':
      return 'Se detectó un envío duplicado con datos distintos. Recarga la página e inténtalo de nuevo.';
    case 'AI_UNAVAILABLE':
      return 'El servicio de validación no está disponible ahora. Podrás reintentarlo.';
    default:
      if (e.status === 413) return 'La imagen supera 5 MB.';
      if (e.status === 429) return 'Demasiadas peticiones. Espera un momento.';
      return e.message;
  }
}
