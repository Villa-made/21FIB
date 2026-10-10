import { API_BASE, USE_FIXTURES } from './config';
import { getAccessToken } from './supabase';
import type { ApiErrorBody } from './types';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details: Record<string, unknown>;

  constructor(status: number, code: string, message: string, details: Record<string, unknown> = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestOptions {
  body?: unknown;
  /** Exige sesión: si no hay token se lanza AUTH_REQUIRED sin llamar al servidor. */
  auth?: boolean;
  /** Reutilizar la misma clave en reintentos de la misma intención (contrato v1). */
  idempotencyKey?: string;
  signal?: AbortSignal;
}

export async function apiRequest<T>(method: HttpMethod, path: string, options: RequestOptions = {}): Promise<T> {
  if (USE_FIXTURES) {
    const { handleFixtureRequest } = await import('@/lib/fixtures');
    return handleFixtureRequest<T>(method, path, options);
  }

  if (!API_BASE) {
    throw new ApiError(0, 'NOT_CONFIGURED', 'La aplicación no está configurada (falta VITE_SUPABASE_URL).');
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  else if (options.auth) throw new ApiError(401, 'AUTH_REQUIRED', 'Necesitas iniciar sesión.');
  if (options.body !== undefined) headers['Content-Type'] = 'application/json';
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') throw cause;
    throw new ApiError(0, 'NETWORK_ERROR', 'No se pudo conectar con el servidor. Revisa tu conexión.');
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const err = (payload as ApiErrorBody | null)?.error;
    throw new ApiError(
      response.status,
      err?.code ?? 'UNKNOWN_ERROR',
      err?.message ?? 'Se ha producido un error inesperado.',
      err?.details ?? {},
    );
  }
  return payload as T;
}

/** `imageUrl` del feed es relativa a la base del API, no al origen de Pages. */
export function resolveMediaUrl(imageUrl: string): string {
  if (/^(https?:|data:|blob:)/.test(imageUrl)) return imageUrl;
  return `${API_BASE}${imageUrl}`;
}

export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
