import { assertEquals } from 'jsr:@std/assert@1';

// Vite embeds every VITE_* variable in the public bundle: only public values may use the prefix.
const PUBLIC_VITE = ['VITE_SUPABASE_ANON_KEY', 'VITE_SUPABASE_URL', 'VITE_TURNSTILE_SITE_KEY'];

Deno.test('.env.example only exposes public VITE_ variables', async () => {
  const text = await Deno.readTextFile(new URL('../../.env.example', import.meta.url));
  const vite = [...text.matchAll(/^\s*#?\s*(VITE_[A-Z0-9_]+)\s*=/gm)].map((m) => m[1]).sort();
  assertEquals(vite, PUBLIC_VITE);
});
