Repositorio de nuestro equipo para el Barcelona AI Hackathon (9–10 octubre 2026, Itnig Coworking).

## Frontend (React + Vite + TS)

```bash
npm install
cp .env.example .env.local   # rellenar VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY / VITE_TURNSTILE_SITE_KEY
npm run dev                  # http://localhost:5173
npm run build && npm run lint && npm test
```

- `VITE_USE_FIXTURES=true` simula el API v1 en memoria **solo en `npm run dev`**; en `vite build` los fixtures se sustituyen por un stub, así que nunca hay aprobaciones o puntos simulados en producción.
- En modo fixtures: incluir "borrosa", "error" o "gato" en la descripción fuerza `NEEDS_EVIDENCE`, `TECHNICAL_ERROR` o `REJECTED`.
- El cliente consume `${VITE_SUPABASE_URL}/functions/v1/api/v1/...` según `docs/design/api-contracts.md`.
