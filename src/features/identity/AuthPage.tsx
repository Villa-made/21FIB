import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ApiError } from '@/lib/api';
import { TURNSTILE_SITE_KEY } from '@/lib/config';
import Turnstile from '@/shared/Turnstile';
import { Alert, Button, Card, PageTitle, Spinner, inputClass } from '@/shared/ui';
import { useAuth } from './AuthContext';
import { createProfile, signIn, signUp } from './authService';

type Mode = 'login' | 'register';

const ALIAS_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;
const ALIAS_RULE = 'El alias debe tener 3–24 caracteres: letras, números, punto, guion o guion bajo.';

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === 'ALIAS_TAKEN' || e.status === 409) return 'Ese alias ya está en uso. Elige otro.';
    return e.message;
  }
  return 'Ha ocurrido un error inesperado.';
}

function AliasField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">Alias público</span>
      <input
        className={inputClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="p. ej. EcoMarta"
        autoComplete="nickname"
        required
      />
      <span className="mt-1 block text-xs text-stone-500">Es lo único que verán los demás. No uses tu nombre real si no quieres.</span>
    </label>
  );
}

/** Usuario con sesión pero sin perfil (p. ej. el alias falló tras crear la cuenta). */
function CompleteProfile() {
  const { refresh, signOut } = useAuth();
  const [alias, setAlias] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!adult) return setError('Debes declarar que eres mayor de 18 años.');
    if (!ALIAS_PATTERN.test(alias.trim())) return setError(ALIAS_RULE);
    setBusy(true);
    setError(null);
    try {
      await createProfile(alias.trim());
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <form onSubmit={submit} className="space-y-4">
        <p className="text-sm text-stone-600">Último paso: elige tu alias para poder participar.</p>
        <AliasField value={alias} onChange={setAlias} />
        <AdultCheckbox checked={adult} onChange={setAdult} />
        {error && <Alert tone="error">{error}</Alert>}
        <div className="flex gap-2">
          <Button type="submit" disabled={busy} className="flex-1">{busy ? 'Guardando…' : 'Guardar alias'}</Button>
          <Button type="button" variant="ghost" onClick={() => void signOut()}>Salir</Button>
        </div>
      </form>
    </Card>
  );
}

function AdultCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-start gap-3 text-sm">
      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-brand-600" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>Declaro que tengo <strong>18 años o más</strong>.</span>
    </label>
  );
}

export default function AuthPage() {
  const { status, refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [mode, setMode] = useState<Mode>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [alias, setAlias] = useState('');
  const [adult, setAdult] = useState(false);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const [captchaKey, setCaptchaKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status === 'loading') return <Spinner />;
  if (status === 'ready') return <Navigate to={from} replace />;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (mode === 'register') {
      if (!adult) return setError('Solo pueden participar personas mayores de 18 años.');
      if (!ALIAS_PATTERN.test(alias.trim())) return setError(ALIAS_RULE);
    }
    if (TURNSTILE_SITE_KEY && !captcha) return setError('Completa la verificación anti-bots.');
    setBusy(true);
    try {
      if (mode === 'register') {
        await signUp(email.trim(), password, captcha);
        try {
          await createProfile(alias.trim());
        } catch (err) {
          // La cuenta existe pero el alias no se guardó: se muestra el paso "completar perfil".
          await refresh();
          setError(errorMessage(err));
          return;
        }
      } else {
        await signIn(email.trim(), password, captcha);
      }
      await refresh();
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
      // Un token Turnstile solo vale una vez: forzamos un widget nuevo.
      setCaptcha(null);
      setCaptchaKey((k) => k + 1);
    } finally {
      setBusy(false);
    }
  }

  if (status === 'needs-profile') {
    return (
      <>
        <PageTitle title="Completa tu perfil" />
        {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
        <CompleteProfile />
      </>
    );
  }

  return (
    <>
      <PageTitle
        title={mode === 'register' ? 'Crea tu cuenta' : 'Inicia sesión'}
        subtitle="Necesitas una cuenta para registrar acciones y dar Me gusta. Ver el feed y el ranking es libre."
      />
      <div className="mb-4 grid grid-cols-2 rounded-xl bg-stone-200 p-1 text-sm font-semibold" role="tablist">
        {(['register', 'login'] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={mode === m}
            onClick={() => { setMode(m); setError(null); }}
            className={`rounded-lg py-2 ${mode === m ? 'bg-white shadow-sm' : 'text-stone-600'}`}
          >
            {m === 'register' ? 'Crear cuenta' : 'Entrar'}
          </button>
        ))}
      </div>
      <Card>
        <form onSubmit={submit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Email</span>
            <input className={inputClass} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm font-medium">Contraseña</span>
            <input
              className={inputClass}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
              minLength={8}
              required
            />
          </label>
          {mode === 'register' && (
            <>
              <AliasField value={alias} onChange={setAlias} />
              <AdultCheckbox checked={adult} onChange={setAdult} />
              <Alert tone="info">
                Beta: no verificamos el email y <strong>no hay recuperación de contraseña por correo</strong>. Guarda bien tu contraseña.
              </Alert>
            </>
          )}
          <Turnstile key={captchaKey} onToken={setCaptcha} />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? 'Un momento…' : mode === 'register' ? 'Crear cuenta' : 'Entrar'}
          </Button>
        </form>
      </Card>
    </>
  );
}
