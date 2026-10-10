import { ApiError, apiRequest } from '@/lib/api';
import { USE_FIXTURES } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export interface Profile {
  userId: string;
  alias: string;
}

// PROPUESTA A ACORDAR CON A: el contrato v1 dice que el servidor crea `profiles`
// pero no fija la ruta. Usamos `GET /v1/profiles/me` y `POST /v1/profiles`.
export async function fetchMyProfile(): Promise<Profile | null> {
  try {
    return await apiRequest<Profile>('GET', '/v1/profiles/me', { auth: true });
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}

export async function createProfile(alias: string): Promise<Profile> {
  if (USE_FIXTURES) {
    const fx = await import('@/lib/fixtures');
    const user = fx.getFixtureUser();
    if (!user) throw new ApiError(401, 'AUTH_REQUIRED', 'Necesitas iniciar sesión.');
    fx.fixtureRegisterAlias(alias);
    fx.setFixtureUser({ ...user, alias });
    return { userId: user.userId, alias };
  }
  return apiRequest<Profile>('POST', '/v1/profiles', { auth: true, body: { alias, adultDeclared: true } });
}

function requireClient() {
  if (!supabase) throw new ApiError(0, 'NOT_CONFIGURED', 'La autenticación no está configurada.');
  return supabase;
}

export async function signUp(email: string, password: string, captchaToken: string | null): Promise<void> {
  if (USE_FIXTURES) {
    const fx = await import('@/lib/fixtures');
    fx.setFixtureUser({ userId: crypto.randomUUID(), alias: '', email });
    return;
  }
  const { data, error } = await requireClient().auth.signUp({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) throw toAuthError(error.message, error.status);
  if (!data.session) {
    throw new ApiError(0, 'NO_SESSION', 'La cuenta se creó pero no se inició sesión. Prueba a entrar con tus datos.');
  }
}

export async function signIn(email: string, password: string, captchaToken: string | null): Promise<void> {
  if (USE_FIXTURES) {
    const fx = await import('@/lib/fixtures');
    fx.setFixtureUser(fx.getFixtureUser() ?? { userId: crypto.randomUUID(), alias: '', email });
    return;
  }
  const { error } = await requireClient().auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  });
  if (error) throw toAuthError(error.message, error.status);
}

export async function signOut(): Promise<void> {
  if (USE_FIXTURES) {
    const fx = await import('@/lib/fixtures');
    fx.setFixtureUser(null);
    return;
  }
  await supabase?.auth.signOut();
}

/** Traduce errores de Supabase Auth a mensajes seguros en castellano (sin filtrar detalles). */
function toAuthError(message: string, status?: number): ApiError {
  const m = message.toLowerCase();
  if (m.includes('invalid login')) return new ApiError(400, 'INVALID_CREDENTIALS', 'Email o contraseña incorrectos.');
  if (m.includes('already registered') || m.includes('already exists'))
    return new ApiError(400, 'EMAIL_IN_USE', 'Ya existe una cuenta con ese email. Inicia sesión.');
  if (m.includes('captcha')) return new ApiError(400, 'CAPTCHA_FAILED', 'La verificación anti-bots ha fallado. Vuelve a intentarlo.');
  if (m.includes('password')) return new ApiError(400, 'WEAK_PASSWORD', 'La contraseña no es válida: usa al menos 8 caracteres.');
  if (status === 429) return new ApiError(429, 'RATE_LIMITED', 'Demasiados intentos. Espera un momento.');
  return new ApiError(status ?? 0, 'AUTH_ERROR', 'No se pudo completar la autenticación.');
}
