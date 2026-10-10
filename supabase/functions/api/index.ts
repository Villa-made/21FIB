import { ERROR_CODES } from './domain/contracts.ts';
import { createSupabaseTokenVerifier } from './domain/auth.ts';
import { createServiceClient } from './domain/db.ts';
import { ApiError, corsHeaders, httpError, parseAllowedOrigins, withCors } from './domain/http.ts';
import { profileRoutes } from './routes/profiles.ts';

// Supabase keeps the function name in the path: a call to
// https://<project>.supabase.co/functions/v1/api/v1/... reaches this function as /api/v1/...
// Source: https://supabase.com/docs/guides/functions/routing
const API_PREFIX = '/api/v1';

export interface Route {
  method: string;
  /** Path relative to /api/v1, URLPattern syntax (e.g. `/contributions/:id`). */
  path: string;
  handler: (req: Request, params: Record<string, string>) => Response | Promise<Response>;
}

// Dependencies remain lazy: createServiceClient() reads secrets only inside route handlers.
const productionRoutes: Route[] = profileRoutes({
  verifier: createSupabaseTokenVerifier(),
  db: createServiceClient,
});

export function createHandler(routes: Route[]): (req: Request) => Promise<Response> {
  const compiled = routes.map((r) => ({
    method: r.method.toUpperCase(),
    pattern: new URLPattern({ pathname: `${API_PREFIX}${r.path}` }),
    handler: r.handler,
  }));

  return async function handle(req: Request): Promise<Response> {
    const cors = corsHeaders(req, parseAllowedOrigins(Deno.env.get('ALLOWED_ORIGINS')));

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      const url = new URL(req.url);
      for (const route of compiled) {
        if (route.method !== req.method) continue;
        const match = route.pattern.exec({ pathname: url.pathname });
        if (match === null) continue;
        const params = match.pathname.groups as Record<string, string>;
        return withCors(await route.handler(req, params), cors);
      }
      return withCors(httpError(404, ERROR_CODES.NOT_FOUND, 'Recurso no encontrado'), cors);
    } catch (err) {
      if (err instanceof ApiError) {
        return withCors(httpError(err.status, err.code, err.message, err.details), cors);
      }
      // Never expose the stack or the internal message; log only the error class.
      console.error('unhandled error', err instanceof Error ? err.name : typeof err);
      return withCors(httpError(500, ERROR_CODES.INTERNAL, 'Error interno'), cors);
    }
  };
}

export const handler = createHandler(productionRoutes);

if (import.meta.main) {
  Deno.serve(handler);
}
