// SOLO DESARROLLO. Simula el contrato API v1 en memoria para que la UI avance sin backend.
// Se carga mediante import dinámico protegido por `import.meta.env.DEV`, así que no entra
// en el build de producción. Las "aprobaciones" de aquí son falsas y nunca llegan a la beta.
import { ApiError, type HttpMethod, type RequestOptions } from './api';
import type {
  ActionType,
  CreateContributionRequest,
  CreateContributionResponse,
  FeedItem,
  LeaderboardEntry,
  Municipality,
  OwnContribution,
  Page,
  UploadTicket,
} from './types';

const FIXTURE_USER_KEY = 'fixtures.user';

export interface FixtureUser {
  userId: string;
  alias: string;
  email: string;
}

export function getFixtureUser(): FixtureUser | null {
  try {
    const raw = localStorage.getItem(FIXTURE_USER_KEY);
    return raw ? (JSON.parse(raw) as FixtureUser) : null;
  } catch {
    return null;
  }
}

export function setFixtureUser(user: FixtureUser | null): void {
  try {
    if (user) localStorage.setItem(FIXTURE_USER_KEY, JSON.stringify(user));
    else localStorage.removeItem(FIXTURE_USER_KEY);
  } catch {
    // almacenamiento no disponible: la sesión simulada dura lo que la pestaña
  }
}

const takenAliases = new Set(['ecousuario', 'lauraverde', 'marcrecicla']);

export function fixtureRegisterAlias(alias: string): void {
  if (takenAliases.has(alias.toLowerCase())) {
    throw new ApiError(409, 'ALIAS_TAKEN', 'Ese alias ya está en uso.');
  }
  takenAliases.add(alias.toLowerCase());
}

const MUNICIPALITIES: Municipality[] = [
  { code: '08019', name: 'Barcelona', provinceName: 'Barcelona' },
  { code: '08101', name: "L'Hospitalet de Llobregat", provinceName: 'Barcelona' },
  { code: '08015', name: 'Badalona', provinceName: 'Barcelona' },
  { code: '08279', name: 'Terrassa', provinceName: 'Barcelona' },
  { code: '08187', name: 'Sabadell', provinceName: 'Barcelona' },
  { code: '28079', name: 'Madrid', provinceName: 'Madrid' },
  { code: '46250', name: 'València', provinceName: 'Valencia/València' },
  { code: '41091', name: 'Sevilla', provinceName: 'Sevilla' },
  { code: '50297', name: 'Zaragoza', provinceName: 'Zaragoza' },
  { code: '17079', name: 'Girona', provinceName: 'Girona' },
];

function placeholderImage(emoji: string, hue: number): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300"><rect width="400" height="300" fill="hsl(${hue} 45% 85%)"/><text x="200" y="185" font-size="120" text-anchor="middle">${emoji}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

interface FixturePost extends FeedItem {
  authorId: string;
  points: number;
  hidden: boolean;
}

const posts: FixturePost[] = [
  { id: 'f-1', authorId: 'u-1', authorAlias: 'LauraVerde', actionType: 'LITTER_COLLECTION', description: 'Hemos recogido dos bolsas de plásticos en la playa de la Barceloneta.', municipality: MUNICIPALITIES[0]!, imageUrl: placeholderImage('🏖️', 190), publishedAt: hoursAgo(3), likeCount: 12, likedByMe: false, points: 20, hidden: false },
  { id: 'f-2', authorId: 'u-2', authorAlias: 'MarcRecicla', actionType: 'RECYCLING', description: 'Separé vidrio, papel y envases de toda la semana.', municipality: MUNICIPALITIES[4]!, imageUrl: placeholderImage('♻️', 120), publishedAt: hoursAgo(20), likeCount: 7, likedByMe: false, points: 10, hidden: false },
  { id: 'f-3', authorId: 'u-3', authorAlias: 'EcoUsuario', actionType: 'RECYCLING', description: 'Llevé las pilas usadas al punto limpio del barrio.', municipality: MUNICIPALITIES[5]!, imageUrl: placeholderImage('🔋', 50), publishedAt: hoursAgo(30), likeCount: 3, likedByMe: false, points: 10, hidden: false },
  { id: 'f-4', authorId: 'u-1', authorAlias: 'LauraVerde', actionType: 'RECYCLING', description: 'Cartón de la mudanza al contenedor azul.', municipality: MUNICIPALITIES[0]!, imageUrl: placeholderImage('📦', 30), publishedAt: hoursAgo(50), likeCount: 3, likedByMe: false, points: 10, hidden: false },
];

interface FixtureContribution extends OwnContribution {
  authorId: string;
  description: string;
  municipalityCode: string;
  photoPath: string;
  idempotencyKey: string;
  resolveAt: number;
}

const contributions = new Map<string, FixtureContribution>();
const uploadedPreviews = new Map<string, string>();

/** Permite que el formulario muestre la foto subida en el feed simulado. */
export function registerFixturePreview(photoPath: string, objectUrl: string): void {
  uploadedPreviews.set(photoPath, objectUrl);
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function requireUser(): FixtureUser {
  const user = getFixtureUser();
  if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Necesitas iniciar sesión.');
  return user;
}

function visiblePosts(): FixturePost[] {
  const cutoff = Date.now() - 30 * 86_400_000;
  return posts
    .filter((p) => !p.hidden && Date.parse(p.publishedAt) >= cutoff)
    .sort((a, b) => b.likeCount - a.likeCount || Date.parse(b.publishedAt) - Date.parse(a.publishedAt));
}

function leaderboard(): LeaderboardEntry[] {
  const totals = new Map<string, { alias: string; points: number }>();
  for (const p of posts) {
    if (p.hidden) continue;
    const t = totals.get(p.authorId) ?? { alias: p.authorAlias, points: 0 };
    t.points += p.points;
    totals.set(p.authorId, t);
  }
  const sorted = [...totals.entries()].sort((a, b) => b[1].points - a[1].points || a[1].alias.localeCompare(b[1].alias));
  let rank = 0;
  let prev = Number.NaN;
  return sorted.map(([userId, t], i) => {
    if (t.points !== prev) rank = i + 1;
    prev = t.points;
    return { rank, userId, alias: t.alias, points: t.points };
  });
}

/** Simula el dictamen asíncrono: "foto" o "borrosa" en la descripción fuerzan casos negativos. */
function advance(c: FixtureContribution): void {
  if (c.status !== 'PENDING' || Date.now() < c.resolveAt) return;
  const text = c.description.toLowerCase();
  if (text.includes('borrosa')) {
    c.status = 'NEEDS_EVIDENCE';
    c.reason = 'La foto no permite ver con claridad la acción realizada.';
  } else if (text.includes('error')) {
    c.status = 'TECHNICAL_ERROR';
    c.reason = 'El servicio de validación no está disponible ahora mismo.';
  } else if (text.includes('gato')) {
    c.status = 'REJECTED';
    c.reason = 'La imagen no muestra ninguna acción de reciclaje o recogida de residuos.';
  } else {
    c.status = 'APPROVED';
    c.reason = 'La foto y la descripción son coherentes con la acción.';
    c.approvedAt = new Date().toISOString();
    c.effectivePoints = c.actionType === 'RECYCLING' ? 10 : 20;
    const user = getFixtureUser();
    posts.unshift({
      id: c.id,
      authorId: c.authorId,
      authorAlias: user?.alias ?? 'Tú',
      actionType: c.actionType,
      description: c.description,
      municipality: MUNICIPALITIES.find((m) => m.code === c.municipalityCode) ?? MUNICIPALITIES[0]!,
      imageUrl: uploadedPreviews.get(c.photoPath) ?? placeholderImage('🌱', 140),
      publishedAt: c.approvedAt,
      likeCount: 0,
      likedByMe: false,
      points: c.effectivePoints,
      hidden: false,
    });
  }
  const unresolved = c.status === 'NEEDS_EVIDENCE' || c.status === 'TECHNICAL_ERROR';
  c.canCancel = unresolved;
  c.canRetry = c.status === 'TECHNICAL_ERROR';
  c.canProvideEvidence = c.status === 'NEEDS_EVIDENCE';
}

function publicView(c: FixtureContribution): OwnContribution {
  advance(c);
  const { id, actionType, status, reason, submittedAt, approvedAt, isHidden, effectivePoints, canRetry, canProvideEvidence, canCancel } = c;
  return { id, actionType, status, reason, submittedAt, approvedAt, isHidden, effectivePoints, canRetry, canProvideEvidence, canCancel };
}

function ownContribution(id: string): FixtureContribution {
  const user = requireUser();
  const c = contributions.get(id);
  if (!c || c.authorId !== user.userId) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
  return c;
}

export async function handleFixtureRequest<T>(method: HttpMethod, rawPath: string, options: RequestOptions): Promise<T> {
  await delay(250);
  const url = new URL(rawPath, 'http://fixtures');
  const path = url.pathname;
  const body = (options.body ?? {}) as Record<string, unknown>;
  let m: RegExpMatchArray | null;

  if (method === 'GET' && path === '/v1/feed') {
    const items = visiblePosts().map(({ authorId: _a, points: _p, hidden: _h, ...item }) => item);
    return { items, nextCursor: null } satisfies Page<FeedItem> as T;
  }

  if (method === 'GET' && path === '/v1/leaderboard') {
    return { items: leaderboard(), nextCursor: null } satisfies Page<LeaderboardEntry> as T;
  }

  if (method === 'GET' && path === '/v1/municipalities') {
    const q = (url.searchParams.get('q') ?? '').trim().toLowerCase();
    if (q.length < 2) throw new ApiError(400, 'QUERY_TOO_SHORT', 'Escribe al menos 2 letras.');
    const norm = (s: string) => s.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
    return { items: MUNICIPALITIES.filter((mu) => norm(mu.name).includes(norm(q))), nextCursor: null } satisfies Page<Municipality> as T;
  }

  if (method === 'POST' && path === '/v1/uploads') {
    const user = requireUser();
    if (Number(body.sizeBytes) > 5 * 1024 * 1024) throw new ApiError(413, 'PHOTO_TOO_LARGE', 'La imagen supera 5 MB.');
    return { photoPath: `staging/${user.userId}/${crypto.randomUUID()}`, uploadToken: 'fixture-token', expiresAt: new Date(Date.now() + 600_000).toISOString() } satisfies UploadTicket as T;
  }

  if (method === 'POST' && path === '/v1/contributions') {
    const user = requireUser();
    const req = body as unknown as CreateContributionRequest;
    const existing = [...contributions.values()].find((c) => c.authorId === user.userId && c.idempotencyKey === options.idempotencyKey);
    if (existing) {
      return { id: existing.id, status: 'PENDING', submittedAt: existing.submittedAt, pointsIfApproved: existing.actionType === 'RECYCLING' ? 10 : 20 } satisfies CreateContributionResponse as T;
    }
    const mine = [...contributions.values()].filter((c) => c.authorId === user.userId && c.actionType === req.actionType);
    for (const c of mine) advance(c);
    if (mine.some((c) => ['PENDING', 'NEEDS_EVIDENCE', 'TECHNICAL_ERROR'].includes(c.status))) {
      throw new ApiError(409, 'PENDING_CONTRIBUTION_EXISTS', 'Ya tienes una contribución de este tipo pendiente.');
    }
    const lastApproved = mine.filter((c) => c.status === 'APPROVED').map((c) => Date.parse(c.submittedAt)).sort((a, b) => b - a)[0];
    if (lastApproved && Date.now() - lastApproved < 3_600_000) {
      throw new ApiError(409, 'COOLDOWN_ACTIVE', 'Debes esperar antes de volver a registrar esta acción.', { retryAt: new Date(lastApproved + 3_600_000).toISOString() });
    }
    if (!MUNICIPALITIES.some((mu) => mu.code === req.municipalityCode)) throw new ApiError(422, 'INVALID_MUNICIPALITY', 'Municipio no válido.');
    const id = crypto.randomUUID();
    const submittedAt = new Date().toISOString();
    contributions.set(id, {
      id, authorId: user.userId, actionType: req.actionType as ActionType, status: 'PENDING', reason: null, submittedAt, approvedAt: null,
      isHidden: false, effectivePoints: 0, canRetry: false, canProvideEvidence: false, canCancel: true,
      description: req.description, municipalityCode: req.municipalityCode, photoPath: req.photoPath,
      idempotencyKey: options.idempotencyKey ?? id, resolveAt: Date.now() + 4000,
    });
    return { id, status: 'PENDING', submittedAt, pointsIfApproved: req.actionType === 'RECYCLING' ? 10 : 20 } satisfies CreateContributionResponse as T;
  }

  if ((m = path.match(/^\/v1\/contributions\/([^/]+)$/)) && method === 'GET') {
    return publicView(ownContribution(m[1]!)) as T;
  }

  if ((m = path.match(/^\/v1\/contributions\/([^/]+)\/(evidence|retry|cancel|hide)$/)) && method === 'POST') {
    const id = m[1]!;
    const action = m[2]!;
    if (action === 'hide') {
      const user = requireUser();
      const post = posts.find((p) => p.id === id);
      if (!post) throw new ApiError(404, 'NOT_FOUND', 'No encontrado.');
      if (post.authorId !== user.userId) throw new ApiError(403, 'NOT_OWNER', 'Solo el autor puede ocultar esta publicación.');
      post.hidden = true;
      const c = contributions.get(id);
      if (c) { c.isHidden = true; c.effectivePoints = 0; }
      return (c ? publicView(c) : undefined) as T;
    }
    const c = ownContribution(id);
    advance(c);
    const allowed = action === 'cancel' ? c.canCancel || c.status === 'PENDING' : action === 'retry' ? c.canRetry : c.canProvideEvidence;
    if (!allowed) throw new ApiError(409, 'INVALID_STATE', 'Esta acción no está permitida en el estado actual.');
    if (action === 'cancel') {
      c.status = 'CANCELLED';
      c.canCancel = c.canRetry = c.canProvideEvidence = false;
    } else {
      if (action === 'evidence') c.photoPath = String(body.photoPath ?? c.photoPath);
      c.description = c.description.replace(/borrosa|error/gi, '');
      c.status = 'PENDING';
      c.reason = null;
      c.canRetry = c.canProvideEvidence = false;
      c.canCancel = true;
      c.resolveAt = Date.now() + 4000;
    }
    return publicView(c) as T;
  }

  if ((m = path.match(/^\/v1\/contributions\/([^/]+)\/like$/)) && (method === 'PUT' || method === 'DELETE')) {
    const user = requireUser();
    const post = visiblePosts().find((p) => p.id === m![1]);
    if (!post) throw new ApiError(404, 'NOT_FOUND', 'Publicación no disponible.');
    if (post.authorId === user.userId) throw new ApiError(403, 'OWN_CONTRIBUTION', 'No puedes dar Me gusta a tu propia publicación.');
    if (method === 'PUT' && !post.likedByMe) { post.likedByMe = true; post.likeCount++; }
    if (method === 'DELETE' && post.likedByMe) { post.likedByMe = false; post.likeCount--; }
    return undefined as T;
  }

  if (method === 'POST' && path === '/v1/reports') {
    if (!body.turnstileToken) throw new ApiError(400, 'CAPTCHA_REQUIRED', 'Completa la verificación anti-bots.');
    return { accepted: true } as T;
  }

  throw new ApiError(404, 'NOT_FOUND', `Fixture no definido: ${method} ${path}`);
}
