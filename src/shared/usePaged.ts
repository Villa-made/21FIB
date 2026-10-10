import { useCallback, useEffect, useState } from 'react';
import type { Page } from '@/lib/types';

/** Carga paginada por cursor opaco (contrato v1). `reload` reinicia desde la primera página. */
export function usePaged<T>(fetchPage: (cursor: string | null, signal?: AbortSignal) => Promise<Page<T>>) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'loading-more' | 'error'>('loading');
  const [error, setError] = useState<unknown>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    const ctrl = new AbortController();
    fetchPage(null, ctrl.signal)
      .then((page) => {
        setItems(page.items);
        setCursor(page.nextCursor);
        setStatus('ready');
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError(e);
        setStatus('error');
      });
    return () => ctrl.abort();
  }, [fetchPage, version]);

  const loadMore = useCallback(async () => {
    if (!cursor) return;
    setStatus('loading-more');
    try {
      const page = await fetchPage(cursor);
      setItems((prev) => [...prev, ...page.items]);
      setCursor(page.nextCursor);
      setStatus('ready');
    } catch (e) {
      setError(e);
      setStatus('error');
    }
  }, [cursor, fetchPage]);

  const reload = useCallback(() => {
    setStatus('loading');
    setVersion((v) => v + 1);
  }, []);

  return { items, setItems, hasMore: cursor !== null, status, error, loadMore, reload };
}
