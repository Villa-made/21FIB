const env = import.meta.env;

export const SUPABASE_URL: string = env.VITE_SUPABASE_URL ?? '';
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY ?? '';
export const TURNSTILE_SITE_KEY: string = env.VITE_TURNSTILE_SITE_KEY ?? '';

/** Base del Edge Function `api`; las rutas del contrato empiezan por `/v1`. */
export const API_BASE = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/api` : '';

/**
 * Fixtures solo en `vite dev`. En un build de producción `import.meta.env.DEV` es false,
 * así que nunca pueden simular aprobaciones ni puntos en la beta publicada.
 */
export const USE_FIXTURES = import.meta.env.DEV && import.meta.env.VITE_USE_FIXTURES === 'true';

export const isSupabaseConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
