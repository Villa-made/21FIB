// Ports consumed by the domain (plan §4, D7). Real implementations of the EXIF inspector belong
// to Dev C (media/evidence.ts, T09); the domain only sees these interfaces so it can run with fakes.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';
import type { CaptureOrigin } from './contracts.ts';

export type EvidenceInspection =
  | { ok: true; mime: string; captureExifAt: Date | null }
  | { ok: false; code: 'EXIF_REQUIRED' | 'PHOTO_TOO_OLD' | 'UNSUPPORTED_MEDIA' };

export interface EvidenceInspector {
  /** `serverNow` always comes from the server clock, never from client data. */
  inspect(bytes: Uint8Array, origin: CaptureOrigin, serverNow: Date): EvidenceInspection;
}

export interface EvidenceStorage {
  /** Bytes of a private evidence object, or `null` when it does not exist. */
  download(path: string): Promise<Uint8Array | null>;
}

export const EVIDENCE_BUCKET = 'evidence-private';

/**
 * EvidenceStorage over the private bucket, using the service-role client.
 * Source: https://supabase.com/docs/reference/javascript/storage-from-download
 */
export function supabaseEvidenceStorage(db: SupabaseClient): EvidenceStorage {
  return {
    async download(path) {
      const { data, error } = await db.storage.from(EVIDENCE_BUCKET).download(path);
      if (error) {
        const e = error as { status?: number | string; statusCode?: number | string; message?: string };
        const missing = String(e.statusCode ?? e.status) === '404' || /not found/i.test(e.message ?? '');
        if (missing) return null;
        throw new Error('Evidence download failed');
      }
      return new Uint8Array(await data.arrayBuffer());
    },
  };
}
