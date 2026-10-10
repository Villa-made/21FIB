import type { ButtonHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 disabled:bg-brand-600/50',
  secondary: 'bg-white text-stone-800 ring-1 ring-stone-300 hover:bg-stone-100 disabled:opacity-50',
  danger: 'bg-red-600 text-white hover:bg-red-700 disabled:bg-red-600/50',
  ghost: 'text-stone-600 hover:bg-stone-100 disabled:opacity-50',
};

export function Button({
  variant = 'primary',
  className = '',
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-stone-200 ${className}`}>{children}</div>;
}

type Tone = 'info' | 'success' | 'warning' | 'error';

const TONES: Record<Tone, string> = {
  info: 'bg-sky-50 text-sky-900 ring-sky-200',
  success: 'bg-brand-50 text-brand-800 ring-brand-100',
  warning: 'bg-amber-50 text-amber-900 ring-amber-200',
  error: 'bg-red-50 text-red-800 ring-red-200',
};

export function Alert({ tone = 'info', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-xl px-4 py-3 text-sm ring-1 ${TONES[tone]}`}>
      {children}
    </div>
  );
}

export function Spinner({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-8 text-sm text-stone-500" role="status">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-stone-300 border-t-brand-600" />
      {label}
    </div>
  );
}

export function PageTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {subtitle && <p className="mt-1 text-sm text-stone-600">{subtitle}</p>}
    </header>
  );
}

export const inputClass =
  'w-full rounded-xl border-0 bg-white px-3 py-2.5 text-sm ring-1 ring-stone-300 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-brand-600';
