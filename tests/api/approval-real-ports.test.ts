// T13.d — the real EXIF inspector and the real sanitizer of Dev C with the production validator
// adapter, whose Workers AI executor is a FAKE (the real provider is never called). Real DEV
// database and Storage.
import { assert, assertEquals } from 'jsr:@std/assert@1';
import { Image } from 'jsr:@cross/image@0.4.3';
import { createHandler, productionRoutes } from '../../supabase/functions/api/index.ts';
import { createSupabaseTokenVerifier } from '../../supabase/functions/api/domain/auth.ts';
import { createServiceClient } from '../../supabase/functions/api/domain/db.ts';
import {
  supabaseEvidenceStorage,
  supabasePublishedStorage,
  supabaseValidationRepository,
} from '../../supabase/functions/api/domain/ports.ts';
import { createProductionValidator } from '../../supabase/functions/api/domain/production-ports.ts';
import type { ValidationOutcome } from '../../supabase/functions/api/domain/validation-workflow.ts';
import { evidenceInspector } from '../../supabase/functions/api/media/evidence.ts';
import { evidenceSanitizer } from '../../supabase/functions/api/media/sanitize.ts';
import { contributionRoutes } from '../../supabase/functions/api/routes/contributions.ts';
import { mediaRoutes } from '../../supabase/functions/api/routes/media.ts';
import { uploadRoutes } from '../../supabase/functions/api/routes/uploads.ts';
import { anonClient, hasDbEnv, MUNICIPALITY_CODE, TestFixtures } from '../db/support.ts';

const BASE = 'https://proj.supabase.co';
const ignore = !hasDbEnv();
const EVIDENCE_BUCKET = 'evidence-private';
const PUBLISHED_BUCKET = 'published-private';

type Handler = (req: Request) => Promise<Response>;

Deno.test('production route table has exactly one POST /contributions, with the background worker wired', () => {
  const posts = productionRoutes.filter((r) => r.method.toUpperCase() === 'POST' && r.path === '/contributions');
  assertEquals(posts.length, 1);
  // The same table also serves the status and command routes of that single registration.
  for (const [method, path] of [
    ['GET', '/contributions/:id'],
    ['POST', '/contributions/:id/retry'],
    ['POST', '/contributions/:id/evidence'],
    ['POST', '/contributions/:id/cancel'],
    ['POST', '/contributions/:id/hide'],
    ['GET', '/media/:id'],
  ]) {
    assertEquals(
      productionRoutes.filter((r) => r.method.toUpperCase() === method && r.path === path).length,
      1,
      `${method} ${path}`,
    );
  }
});

/** Server clock from the PostgREST `Date` header: the local clock of the test machine may be skewed. */
async function serverNow(): Promise<Date> {
  const res = await fetch(`${Deno.env.get('SUPABASE_URL')}/rest/v1/`, {
    headers: { apikey: Deno.env.get('SUPABASE_ANON_KEY')! },
  });
  await res.body?.cancel();
  const header = res.headers.get('date');
  assert(header, 'PostgREST response has no Date header');
  return new Date(header);
}

const u16 = (v: number) => [v >> 8, v & 0xff];
const u32le = (v: number) => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, v >>> 24];

/** A decodable JPEG carrying an APP1/EXIF segment with DateTimeOriginal and a GPS IFD pointer. */
async function jpegWithExif(capturedAt: Date): Promise<Uint8Array> {
  const clean = await Image.create(8, 8, 200, 40, 40).encode('jpeg');
  const stamp = capturedAt.toISOString().slice(0, 19).replace(/-/g, ':').replace('T', ' ');
  const date = [...new TextEncoder().encode(stamp), 0];
  const tiff = [0x49, 0x49, 0x2a, 0, 8, 0, 0, 0];
  tiff.push(2, 0);
  tiff.push(0x25, 0x88, 4, 0, 1, 0, 0, 0, 38, 0, 0, 0); // GPSInfoIFDPointer
  tiff.push(0x69, 0x87, 4, 0, 1, 0, 0, 0, 44, 0, 0, 0); // ExifIFDPointer
  tiff.push(0, 0, 0, 0); // next IFD
  tiff.push(0, 0, 0, 0, 0, 0); // empty GPS IFD
  tiff.push(1, 0); // Exif IFD entry count
  tiff.push(0x03, 0x90, 2, 0, ...u32le(date.length), ...u32le(62)); // DateTimeOriginal
  tiff.push(0, 0, 0, 0, ...date);
  const body = [...new TextEncoder().encode('Exif\0\0'), ...tiff];
  return new Uint8Array([0xff, 0xd8, 0xff, 0xe1, ...u16(body.length + 2), ...body, ...clean.subarray(2)]);
}

/** Every marker segment of a JPEG: the sanitized copy must have no APP1 (EXIF/XMP) segment. */
function jpegMarkers(bytes: Uint8Array): number[] {
  const markers: number[] = [];
  let offset = 2;
  while (offset + 4 <= bytes.length && bytes[offset] === 0xff) {
    const marker = bytes[offset + 1];
    markers.push(marker);
    if (marker === 0xda) break; // start of scan: entropy-coded data follows
    offset += 2 + ((bytes[offset + 2] << 8) | bytes[offset + 3]);
  }
  return markers;
}

function containsAscii(bytes: Uint8Array, text: string): boolean {
  return new TextDecoder('latin1').decode(bytes).includes(text);
}

interface Harness {
  h: Handler;
  settle(): Promise<ValidationOutcome[]>;
  executorCalls: () => number;
}

/** Real inspector + real sanitizer + production validator adapter over a fake executor. */
function harness(options: { credentials: boolean; now: () => Date }): Harness {
  const outcomes: Promise<ValidationOutcome>[] = [];
  let calls = 0;
  const validator = createProductionValidator(
    (name) => (options.credentials ? `test-${name}` : undefined),
    () => () => {
      calls++;
      return Promise.resolve('{"decision":"APPROVED","reason":"Se ve la acción en la imagen"}');
    },
  );
  const deps = { verifier: createSupabaseTokenVerifier(), db: createServiceClient };
  const h = createHandler([
    ...uploadRoutes(deps),
    ...contributionRoutes({
      ...deps,
      inspector: evidenceInspector,
      now: options.now,
      validationPorts: (db) => ({
        repository: supabaseValidationRepository(db),
        evidenceStorage: supabaseEvidenceStorage(db),
        publishedStorage: supabasePublishedStorage(db),
        validator,
        sanitizer: evidenceSanitizer,
      }),
      schedule: (p) => outcomes.push(p as Promise<ValidationOutcome>),
    }),
    ...mediaRoutes(deps),
  ]);
  return {
    h,
    executorCalls: () => calls,
    async settle() {
      const done: ValidationOutcome[] = [];
      while (outcomes.length > 0) done.push(...await Promise.all(outcomes.splice(0)));
      return done;
    },
  };
}

function call(
  h: Handler,
  method: 'GET' | 'POST',
  path: string,
  opts: { token?: string; key?: string; body?: unknown } = {},
): Promise<Response> {
  const headers = new Headers({ 'Content-Type': 'application/json' });
  if (opts.token) headers.set('Authorization', `Bearer ${opts.token}`);
  if (opts.key) headers.set('Idempotency-Key', opts.key);
  return h(
    new Request(`${BASE}/api/v1${path}`, {
      method,
      headers,
      body: method === 'GET' ? undefined : JSON.stringify(opts.body ?? {}),
    }),
  );
}

async function tokenFor(fixtures: TestFixtures, user: { id: string; email: string }): Promise<string> {
  const client = await fixtures.signInAs(user);
  const { data: { session } } = await client.auth.getSession();
  if (!session?.access_token) throw new Error('fixture sign-in did not return an access token');
  return session.access_token;
}

async function uploadPhoto(
  h: Handler,
  fixtures: TestFixtures,
  token: string,
  bytes: Uint8Array,
  contentType: string,
): Promise<string> {
  const res = await call(h, 'POST', '/uploads', { token, body: { contentType, sizeBytes: bytes.length } });
  assertEquals(res.status, 201);
  const { photoPath, uploadToken } = await res.json();
  const { error } = await anonClient().storage.from(EVIDENCE_BUCKET).uploadToSignedUrl(
    photoPath,
    uploadToken,
    new Blob([new Uint8Array(bytes)], { type: contentType }),
    { contentType },
  );
  assertEquals(error, null);
  fixtures.trackObject(EVIDENCE_BUCKET, photoPath);
  return photoPath;
}

async function createContribution(
  h: Handler,
  token: string,
  photoPath: string,
  actionType: 'RECYCLING' | 'LITTER_COLLECTION',
  captureOrigin: 'GALLERY' | 'CAMERA_FLOW',
): Promise<string> {
  const res = await call(h, 'POST', '/contributions', {
    token,
    key: crypto.randomUUID(),
    body: {
      actionType,
      description: 'Reciclado de envases en el contenedor amarillo',
      municipalityCode: MUNICIPALITY_CODE,
      photoPath,
      captureOrigin,
    },
  });
  assertEquals(res.status, 202, await res.clone().text());
  return (await res.json()).id;
}

async function withScenario(
  options: { credentials: boolean },
  fn: (s: { f: TestFixtures; hn: Harness; token: string }) => Promise<void>,
): Promise<void> {
  const f = new TestFixtures();
  try {
    await f.ensureMunicipality();
    const user = await f.createUser();
    const token = await tokenFor(f, user);
    // The EXIF window is judged against the server clock; this machine's clock can be hours off,
    // so the route's `now` is anchored to the database server's time.
    const skewMs = (await serverNow()).getTime() - Date.now();
    const now = () => new Date(Date.now() + skewMs);
    await fn({ f, hn: harness({ ...options, now }), token });
  } finally {
    await f.cleanup();
  }
}

Deno.test({
  name: 'real inspector + sanitizer: JPEG with EXIF -> APPROVED, copy has no EXIF, GET /media -> 200',
  ignore,
  fn: () =>
    withScenario({ credentials: true }, async ({ f, hn, token }) => {
      const capturedAt = new Date((await serverNow()).getTime() - 5 * 60_000);
      const original = await jpegWithExif(capturedAt);
      assert(containsAscii(original, 'Exif'), 'fixture must carry EXIF');
      assert(jpegMarkers(original).includes(0xe1));

      const photoPath = await uploadPhoto(hn.h, f, token, original, 'image/jpeg');
      const id = await createContribution(hn.h, token, photoPath, 'RECYCLING', 'GALLERY');
      f.trackObject(PUBLISHED_BUCKET, `${id}/1`);
      assertEquals(await hn.settle(), ['APPROVED']);
      assertEquals(hn.executorCalls(), 1);

      const dto = await (await call(hn.h, 'GET', `/contributions/${id}`, { token })).json();
      assertEquals(dto.status, 'APPROVED');
      assertEquals(dto.effectivePoints, 10);

      const { data: row } = await f.db.from('contributions').select('public_photo_path, capture_exif_at')
        .eq('id', id).single();
      assertEquals(row?.public_photo_path, `${id}/1`);
      assert(row?.capture_exif_at, 'the inspector stored the EXIF capture time');

      const { data: blob, error } = await f.db.storage.from(PUBLISHED_BUCKET).download(`${id}/1`);
      assertEquals(error, null);
      const copy = new Uint8Array(await blob!.arrayBuffer());
      assertEquals(copy[0], 0xff);
      assertEquals(copy[1], 0xd8);
      assert(!jpegMarkers(copy).includes(0xe1), 'published copy must not carry an APP1 (EXIF/XMP) segment');
      assert(!containsAscii(copy, 'Exif'), 'published copy must not contain EXIF');
      assert(!containsAscii(copy, 'http://ns.adobe.com/xap'), 'published copy must not contain XMP');
      assertEquals(blob!.type, 'image/jpeg');

      const media = await call(hn.h, 'GET', `/media/${id}`);
      assertEquals(media.status, 200);
      assertEquals(media.headers.get('content-type'), 'image/jpeg');
      assertEquals(new Uint8Array(await media.arrayBuffer()), copy);
    }),
});

Deno.test({
  name: 'real sanitizer: a valid PNG from the camera flow is approved and served',
  ignore,
  fn: () =>
    withScenario({ credentials: true }, async ({ f, hn, token }) => {
      const original = await Image.create(8, 8, 30, 160, 60).encode('png');
      const photoPath = await uploadPhoto(hn.h, f, token, original, 'image/png');
      const id = await createContribution(hn.h, token, photoPath, 'LITTER_COLLECTION', 'CAMERA_FLOW');
      f.trackObject(PUBLISHED_BUCKET, `${id}/1`);
      assertEquals(await hn.settle(), ['APPROVED']);

      const media = await call(hn.h, 'GET', `/media/${id}`);
      assertEquals(media.status, 200);
      assertEquals(media.headers.get('content-type'), 'image/png');
      const bytes = new Uint8Array(await media.arrayBuffer());
      assertEquals([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
      for (const chunk of ['eXIf', 'tEXt', 'iTXt', 'zTXt']) {
        assert(!containsAscii(bytes, chunk), `published PNG must not contain ${chunk}`);
      }
      const dto = await (await call(hn.h, 'GET', `/contributions/${id}`, { token })).json();
      assertEquals(dto.effectivePoints, 20);
    }),
});

Deno.test({
  name: 'without Cloudflare credentials every validation ends TECHNICAL_ERROR: no executor call, no copy, no media',
  ignore,
  fn: () =>
    withScenario({ credentials: false }, async ({ f, hn, token }) => {
      const original = await Image.create(8, 8, 30, 60, 160).encode('png');
      const photoPath = await uploadPhoto(hn.h, f, token, original, 'image/png');
      const id = await createContribution(hn.h, token, photoPath, 'RECYCLING', 'CAMERA_FLOW');
      assertEquals(await hn.settle(), ['TECHNICAL_ERROR']);
      assertEquals(hn.executorCalls(), 0);

      const dto = await (await call(hn.h, 'GET', `/contributions/${id}`, { token })).json();
      assertEquals(dto.status, 'TECHNICAL_ERROR');
      assertEquals(dto.canRetry, true);
      assertEquals(dto.effectivePoints, 0);
      const { data } = await f.db.storage.from(PUBLISHED_BUCKET).list(id);
      assertEquals(data?.length, 0);
      assertEquals((await call(hn.h, 'GET', `/media/${id}`)).status, 404);
    }),
});
