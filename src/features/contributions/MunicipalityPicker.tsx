import { useEffect, useId, useState } from 'react';
import type { Municipality } from '@/lib/types';
import { inputClass } from '@/shared/ui';
import { searchMunicipalities } from './contributionApi';

export default function MunicipalityPicker({
  value,
  onChange,
}: {
  value: Municipality | null;
  onChange: (m: Municipality | null) => void;
}) {
  const listId = useId();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Municipality[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'error'>('idle');
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const ctrl = new AbortController();
    const timer = setTimeout(() => {
      setState('loading');
      searchMunicipalities(q, ctrl.signal)
        .then((items) => {
          setResults(items);
          setState('idle');
        })
        .catch((e: unknown) => {
          if (!(e instanceof DOMException && e.name === 'AbortError')) setState('error');
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center justify-between rounded-xl bg-brand-50 px-3 py-2.5 text-sm ring-1 ring-brand-100">
        <span>
          📍 <strong>{value.name}</strong>
          {value.provinceName && <span className="text-stone-500"> · {value.provinceName}</span>}
        </span>
        <button type="button" className="text-brand-700 underline" onClick={() => { onChange(null); setQuery(''); }}>
          Cambiar
        </button>
      </div>
    );
  }

  const showList = open && query.trim().length >= 2;

  return (
    <div className="relative">
      <input
        className={inputClass}
        value={query}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder="Busca tu municipio…"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        autoComplete="off"
      />
      {showList && (
        <ul id={listId} role="listbox" className="absolute z-10 mt-1 max-h-60 w-full overflow-auto rounded-xl bg-white py-1 text-sm shadow-lg ring-1 ring-stone-200">
          {state === 'loading' && <li className="px-3 py-2 text-stone-500">Buscando…</li>}
          {state === 'error' && <li className="px-3 py-2 text-red-700">No se pudo buscar. Inténtalo de nuevo.</li>}
          {state === 'idle' && results.length === 0 && <li className="px-3 py-2 text-stone-500">Sin resultados</li>}
          {state === 'idle' &&
            results.map((m) => (
              <li key={m.code} role="option" aria-selected={false}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left hover:bg-brand-50"
                  onClick={() => { onChange(m); setOpen(false); }}
                >
                  {m.name}
                  {m.provinceName && <span className="text-stone-500"> · {m.provinceName}</span>}
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
