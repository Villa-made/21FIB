// POST /contributions (T10.c2). Contract: docs/design/api-contracts.md §4, plan §4.
// AI validation (T13.c) is deliberately NOT triggered here.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { requireProfile, requireUser, type TokenVerifier } from '../domain/auth.ts';
import {
  type CreateRpcRow,
  fingerprint,
  mapCreateRpcError,
  parseCreateContribution,
  parseIdempotencyKey,
  prepareEvidence,
  toCreateResponse,
} from '../domain/contribution.ts';
import { ERROR_CODES } from '../domain/contracts.ts';
import { ApiError, json } from '../domain/http.ts';
import { type EvidenceInspector, type EvidenceStorage, supabaseEvidenceStorage } from '../domain/ports.ts';
import type { Route } from '../index.ts';

export interface ContributionRouteDeps {
  verifier: TokenVerifier;
  db: () => SupabaseClient;
  inspector: EvidenceInspector;
  storage?: (db: SupabaseClient) => EvidenceStorage;
  now?: () => Date;
}

export function contributionRoutes(deps: ContributionRouteDeps): Route[] {
  return [{
    method: 'POST',
    path: '/contributions',
    handler: async (req) => {
      const user = await requireUser(req, deps.verifier);
      const db = deps.db();
      await requireProfile(user.userId, db);
      const idempotencyKey = parseIdempotencyKey(req);

      let body: unknown;
      try {
        body = await req.json();
      } catch {
        throw new ApiError(400, ERROR_CODES.INVALID_REQUEST, 'Cuerpo de solicitud inválido');
      }
      const input = parseCreateContribution(body, user.userId);
      const print = await fingerprint(input);

      // Replay before touching the photo: same key + same fingerprint never re-inspects nor re-runs the RPC.
      const { data: existing, error: lookupError } = await db
        .from('contributions')
        .select('id, status, submitted_at, points_snapshot, validation_version, idempotency_fingerprint')
        .eq('author_id', user.userId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();
      if (lookupError) throw new Error('Idempotency lookup failed');
      if (existing) {
        if (existing.idempotency_fingerprint !== print) {
          throw new ApiError(
            409,
            ERROR_CODES.IDEMPOTENCY_CONFLICT,
            'La clave de idempotencia ya se usó con otro contenido',
          );
        }
        return json(toCreateResponse({ ...(existing as Omit<CreateRpcRow, 'created'>), created: false }), 202);
      }

      const storage = (deps.storage ?? supabaseEvidenceStorage)(db);
      const now = (deps.now ?? (() => new Date()))();
      const { captureExifAt } = await prepareEvidence(input, { storage, inspector: deps.inspector }, now);

      const { data, error } = await db.rpc('create_contribution', {
        p_author_id: user.userId,
        p_action_type: input.actionType,
        p_description: input.description,
        p_municipality_code: input.municipalityCode,
        p_evidence_path: input.photoPath,
        p_capture_origin: input.captureOrigin,
        p_capture_exif_at: captureExifAt ? captureExifAt.toISOString() : null,
        p_idempotency_key: idempotencyKey,
        p_idempotency_fingerprint: print,
      });
      if (error) throw mapCreateRpcError(error);
      const row = (Array.isArray(data) ? data[0] : data) as CreateRpcRow | undefined;
      if (!row) throw new Error('Create contribution returned no row');
      return json(toCreateResponse(row), 202);
    },
  }];
}
