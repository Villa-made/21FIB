import { ApiError, apiRequest, newIdempotencyKey } from '@/lib/api';
import type { FeedItem, LeaderboardEntry, Page } from '@/lib/types';

function pageQuery(cursor: string | null, limit = 20): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);
  return params.toString();
}

export function getFeed(cursor: string | null, signal?: AbortSignal) {
  return apiRequest<Page<FeedItem>>('GET', `/v1/feed?${pageQuery(cursor)}`, { signal });
}

export function getLeaderboard(cursor: string | null, signal?: AbortSignal) {
  return apiRequest<Page<LeaderboardEntry>>('GET', `/v1/leaderboard?${pageQuery(cursor)}`, { signal });
}

export function setLike(contributionId: string, liked: boolean) {
  return apiRequest<void>(liked ? 'PUT' : 'DELETE', `/v1/contributions/${encodeURIComponent(contributionId)}/like`, { auth: true });
}

export function hideContribution(contributionId: string) {
  return apiRequest<unknown>('POST', `/v1/contributions/${encodeURIComponent(contributionId)}/hide`, {
    auth: true,
    body: {},
    idempotencyKey: newIdempotencyKey(),
  });
}

export function submitReport(contributionId: string, reason: string, turnstileToken: string) {
  return apiRequest<{ accepted: boolean }>('POST', '/v1/reports', { body: { contributionId, reason, turnstileToken } });
}

export function communityErrorMessage(e: unknown): string {
  if (!(e instanceof ApiError)) return 'Ha ocurrido un error inesperado.';
  if (e.status === 401) return 'Inicia sesión para hacer esto.';
  if (e.code === 'OWN_CONTRIBUTION') return 'No puedes dar Me gusta a tu propia publicación.';
  if (e.code === 'NOT_OWNER') return 'Solo el autor puede ocultar esta publicación.';
  if (e.status === 404) return 'Esta publicación ya no está disponible.';
  if (e.status === 429) return 'Demasiadas peticiones. Espera un momento.';
  return e.message;
}
