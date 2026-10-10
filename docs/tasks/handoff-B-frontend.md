# Traspaso — Rol B (frontend)

**Fecha:** 2026-10-10 · **Rama:** `task/T03-spa-base` · **PR:** https://github.com/Villa-made/21FIB/pull/1 (borrador)
**Estado:** T03, T05, T08, T11, T14, T17 implementadas y probadas **solo con fixtures**. Marcadas `REVIEW` en [`todo.md`](todo.md). Pendiente: T22 e integración con backend real.

## Cómo arrancar

```bash
npm install
cp .env.example .env.local      # VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY, VITE_TURNSTILE_SITE_KEY, VITE_USE_FIXTURES
npm run dev                     # http://localhost:5173
npm run build && npm run lint && npm test
```

Con `VITE_USE_FIXTURES=true` (solo `npm run dev`) el API v1 se simula en memoria (`src/lib/fixtures.ts`). En `vite build` se sustituye por `src/lib/fixtures.prod-stub.ts` (ver `vite.config.ts`), así que nunca hay aprobaciones simuladas en producción. Descripción con «borrosa» / «error» / «gato» → `NEEDS_EVIDENCE` / `TECHNICAL_ERROR` / `REJECTED`. Los fixtures se pierden al recargar la página.

## Mapa de código

| Ruta | Pantalla / responsabilidad | Tarea |
|---|---|---|
| `src/lib/api.ts` | Cliente HTTP v1: base `${VITE_SUPABASE_URL}/functions/v1/api`, JWT, `Idempotency-Key`, `ApiError` | T03 |
| `src/lib/types.ts` | DTOs del contrato v1 | T03 |
| `src/shared/Layout.tsx`, `ui.tsx`, `PrivacyPage.tsx`, `Turnstile.tsx`, `usePaged.ts` | Layout, componentes, privacidad, CAPTCHA, paginación | T03/T05/T14 |
| `src/features/identity/*` | `/acceso`: registro, login, alias, ≥18, completar perfil | T05 |
| `src/features/contributions/ContributionPage.tsx` (+ `PhotoPicker`, `MunicipalityPicker`, `photo.ts`) | `/contribuir` | T08 |
| `src/features/contributions/ContributionStatusPage.tsx` | `/contribuciones/:id`: polling, evidence/retry/cancel | T11 |
| `src/features/community/*`, `src/features/scoring/*` | `/` feed (like, denuncia, ocultar) y `/ranking` | T14/T17 |

## Verificado

- `npm run build`, `npm run lint` (0 errores), `npm test` (7/7: EXIF 59/60/61/futuro/ausente, mensajes de error).
- Navegador 375×812 con fixtures: feed/ranking anónimos → registro (alias duplicado → completar perfil) → contribución reciclaje y recogida → aprobada (+10/+20) → ranking «(tú)» → like ajeno / propio bloqueado → denuncia → ocultar (−puntos, desaparece de feed/ranking).

## NO verificado

- Caminos negativos en UI (NEEDS_EVIDENCE, TECHNICAL_ERROR + reintentar, REJECTED, cancelar, cooldown, pendiente duplicada): implementados, no recorridos.
- «Ver más» (los fixtures no paginan).
- Lector EXIF con JPEG real de móvil; cámara/galería en teléfono real.
- Todo contra backend real: Supabase Auth + Turnstile, subida a Storage, endpoints, CORS, `/media/{id}`.

## Supuestos de contrato que el backend (A) debe respetar o corregir

1. Perfil: `GET /v1/profiles/me` y `POST /v1/profiles {alias, adultDeclared}` → `{userId, alias}`; 409 `ALIAS_TAKEN`. (`src/features/identity/authService.ts`)
2. Subida: bucket `evidence-private`, `photoPath` relativo al bucket, `uploadToSignedUrl(photoPath, uploadToken, file)`. (`contributionApi.ts`)
3. Like propio → 403 `OWN_CONTRIBUTION`. (`communityApi.ts`)
4. `FeedItem` sin `authorId`: publicaciones propias se detectan por alias.
5. Sin endpoint «mis contribuciones»: IDs recientes en `localStorage` (`recent.ts`).
6. CORS de la función `api`: `http://localhost:5173` y `*.pages.dev`.

## Siguiente trabajo de B

1. **T22:** con backend real, sustituir fixtures, smoke móvil, revisar errores de red reales; rellenar `[CONTACTO PENDIENTE]` en `PrivacyPage.tsx`.
2. Ajustar 1–6 si A decide otra forma; cualquier cambio de DTO pasa primero por `docs/design/api-contracts.md`.
