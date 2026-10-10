// Sustituye a fixtures.ts en `vite build` (ver vite.config.ts): los datos simulados nunca llegan a producción.
function unavailable(): never {
  throw new Error('Fixtures no disponibles en producción');
}
export const handleFixtureRequest = unavailable;
export const getFixtureUser = unavailable;
export const setFixtureUser = unavailable;
export const fixtureRegisterAlias = unavailable;
export const registerFixturePreview = unavailable;
