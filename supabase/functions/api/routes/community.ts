// PUT / DELETE /contributions/{id}/like (T20). Contract: docs/design/api-contracts.md §3, §4, §6.
// Both are idempotent and answer the final state; likes never grant points (SPEC-scoring).
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import { requireProfile, requireUser, type TokenVerifier } from '../domain/auth.ts';
import { ERROR_CODES, type LikeResponse } from '../domain/contracts.ts';
import { isUuid, mapCommandRpcError } from '../domain/contribution.ts';
import { ApiError, json } from '../domain/http.ts';
import type { Route } from '../index.ts';

export interface CommunityRouteDeps {
  verifier: TokenVerifier;
  db: () => SupabaseClient;
}

export function communityRoutes(deps: CommunityRouteDeps): Route[] {
  const setLike = (liked: boolean): Route['handler'] => async (req, params) => {
    const user = await requireUser(req, deps.verifier);
    const db = deps.db();
    await requireProfile(user.userId, db);
    if (!isUuid(params.id)) {
      throw new ApiError(404, ERROR_CODES.NOT_FOUND, 'Publicación no encontrada');
    }
    const { data, error } = await db.rpc('set_like', {
      p_user: user.userId,
      p_id: params.id,
      p_liked: liked,
    });
    if (error) throw mapCommandRpcError(error);
    const row = (Array.isArray(data) ? data[0] : data) as { liked?: boolean; like_count?: number } | undefined;
    if (!row || typeof row.liked !== 'boolean' || typeof row.like_count !== 'number') {
      throw new Error('set_like returned no row');
    }
    const body: LikeResponse = { liked: row.liked, likeCount: row.like_count };
    return json(body, 200);
  };

  return [
    { method: 'PUT', path: '/contributions/:id/like', handler: setLike(true) },
    { method: 'DELETE', path: '/contributions/:id/like', handler: setLike(false) },
  ];
}
