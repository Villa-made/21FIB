// Shared support for DB integration tests (T01.b onwards).
// Runs against the DEV Supabase project. Env comes from `.env.test` via
// `deno test --env-file=.env.test` (Deno 2: https://docs.deno.com/runtime/reference/cli/env_variables/).
// If the variables are missing the tests are marked `ignore` (reported as SKIPPED, never PASS).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.117.3';

const REQUIRED_ENV = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY'] as const;

// Official INE code, imported in T01.d. Never invent municipality codes.
export const MUNICIPALITY_CODE = '08019';

export function hasDbEnv(): boolean {
  try {
    return REQUIRED_ENV.every((name) => (Deno.env.get(name) ?? '') !== '');
  } catch {
    // --allow-env missing
    return false;
  }
}

export const SKIP_MESSAGE =
  'SKIPPED: missing SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ' +
  '(run with --env-file=.env.test and --allow-env --allow-net --allow-read)';

if (!hasDbEnv()) console.warn(SKIP_MESSAGE);

function makeClient(keyName: 'SUPABASE_ANON_KEY' | 'SUPABASE_SERVICE_ROLE_KEY'): SupabaseClient {
  return createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get(keyName)!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export const serviceClient = (): SupabaseClient => makeClient('SUPABASE_SERVICE_ROLE_KEY');
export const anonClient = (): SupabaseClient => makeClient('SUPABASE_ANON_KEY');

export function randomSuffix(): string {
  return crypto.randomUUID().replaceAll('-', '').slice(0, 10);
}

export interface TestUser {
  id: string;
  email: string;
}

/** Creates DB fixtures through the service-role client and removes them in `cleanup()`. */
export class TestFixtures {
  readonly db = serviceClient();
  private users: TestUser[] = [];

  /** Creates an auth user (admin API, confirmed, random @example.test email) and its profile. */
  async createUser(alias: string = `EcoTest${randomSuffix()}`): Promise<TestUser & { alias: string }> {
    const email = `t01b-${randomSuffix()}@example.test`;
    const { data, error } = await this.db.auth.admin.createUser({
      email,
      password: crypto.randomUUID(),
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`);
    const user = { id: data.user.id, email };
    this.users.push(user);
    const { error: profileError } = await this.db.from('profiles').insert({
      user_id: user.id,
      alias,
      adult_declared_at: new Date().toISOString(),
    });
    if (profileError) throw new Error(`profile insert failed: ${profileError.message}`);
    return { ...user, alias };
  }

  /** Inserts the real INE municipality used by tests; never deleted. */
  async ensureMunicipality(): Promise<void> {
    const { error } = await this.db.from('municipalities').upsert(
      { code: MUNICIPALITY_CODE, name: 'Barcelona', province_name: 'Barcelona' },
      { onConflict: 'code', ignoreDuplicates: true },
    );
    if (error) throw new Error(`municipality upsert failed: ${error.message}`);
  }

  /** Valid contribution row; override fields to provoke a violation. */
  contributionRow(authorId: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      author_id: authorId,
      action_type: 'RECYCLING',
      description: 'Reciclado de envases en el contenedor amarillo',
      municipality_code: MUNICIPALITY_CODE,
      evidence_path: `staging/${authorId}/${crypto.randomUUID()}`,
      capture_origin: 'CAMERA_FLOW',
      points_snapshot: 10,
      idempotency_key: crypto.randomUUID(),
      idempotency_fingerprint: `fp-${randomSuffix()}`,
      ...overrides,
    };
  }

  /** Deletes contributions (FK has no cascade) and then auth users (profiles/likes cascade). */
  async cleanup(): Promise<void> {
    for (const user of this.users) {
      await this.db.from('contributions').delete().eq('author_id', user.id);
      await this.db.auth.admin.deleteUser(user.id);
    }
    this.users = [];
  }
}
