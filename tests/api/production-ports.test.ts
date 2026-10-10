// T13.d — production AI validator adapter. Pure unit tests: the Workers AI executor is always a
// fake, no network, and nothing here can reach the real provider.
import { assert, assertEquals, assertRejects } from 'jsr:@std/assert@1';
import {
  ProviderTechnicalError,
  type VisionInferenceRequest,
} from '../../supabase/functions/api/ai/validator.ts';
import {
  createProductionValidator,
  logProviderDiagnostic,
  type VisionExecutorFactory,
} from '../../supabase/functions/api/domain/production-ports.ts';

const INPUT = {
  actionType: 'RECYCLING' as const,
  description: 'Botella en el contenedor amarillo',
  originalImageBytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 1, 2, 3]),
};
const ENV: Record<string, string> = {
  CLOUDFLARE_ACCOUNT_ID: 'acct-test',
  CLOUDFLARE_AUTH_TOKEN: 'token-secret-value',
};
const env = (name: string) => ENV[name];

function factoryReturning(
  run: (request: VisionInferenceRequest) => Promise<string>,
): { factory: VisionExecutorFactory; builds: number[]; credentials: unknown[] } {
  const state = { builds: [] as number[], credentials: [] as unknown[] };
  const factory: VisionExecutorFactory = (credentials) => {
    state.builds.push(1);
    state.credentials.push(credentials);
    return run;
  };
  return { factory, ...state };
}

for (const missing of ['CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_AUTH_TOKEN']) {
  Deno.test(`missing ${missing} -> rejects and never builds or calls the executor`, async () => {
    let built = 0;
    const validator = createProductionValidator(
      (name) => (name === missing ? undefined : ENV[name]),
      () => {
        built++;
        return () => Promise.resolve('{"decision":"APPROVED","reason":"x"}');
      },
    );
    await assertRejects(() => validator.validate(INPUT));
    assertEquals(built, 0);
  });
}

Deno.test('empty credential values are treated as missing', async () => {
  let built = 0;
  const validator = createProductionValidator(
    (name) => (name === 'CLOUDFLARE_AUTH_TOKEN' ? '' : ENV[name]),
    () => {
      built++;
      return () => Promise.resolve('{"decision":"APPROVED","reason":"x"}');
    },
  );
  await assertRejects(() => validator.validate(INPUT));
  assertEquals(built, 0);
});

Deno.test('credentials are read on every call', async () => {
  const live: Record<string, string | undefined> = { ...ENV };
  const validator = createProductionValidator(
    (name) => live[name],
    () => () => Promise.resolve('{"decision":"NEEDS_EVIDENCE","reason":"Falta contexto"}'),
  );
  assertEquals((await validator.validate(INPUT)).decision, 'NEEDS_EVIDENCE');
  live.CLOUDFLARE_AUTH_TOKEN = undefined;
  await assertRejects(() => validator.validate(INPUT));
  live.CLOUDFLARE_AUTH_TOKEN = 'again';
  assertEquals((await validator.validate(INPUT)).decision, 'NEEDS_EVIDENCE');
});

Deno.test('a valid JSON answer from the executor becomes the decision', async () => {
  const seen: VisionInferenceRequest[] = [];
  const { factory } = factoryReturning((request) => {
    seen.push(request);
    return Promise.resolve('{"decision":"REJECTED","reason":"No se ve la acción"}');
  });
  const result = await createProductionValidator(env, factory).validate(INPUT);
  assertEquals(result, { decision: 'REJECTED', reason: 'No se ve la acción' });
  assertEquals(seen.length, 1);
  assertEquals(seen[0].mediaType, 'image/jpeg');
});

Deno.test('executor credentials come from the secrets, not from the request', async () => {
  const { factory, credentials } = factoryReturning(() =>
    Promise.resolve('{"decision":"APPROVED","reason":"Bien"}')
  );
  await createProductionValidator(env, factory).validate(INPUT);
  assertEquals(credentials, [{ accountId: 'acct-test', apiToken: 'token-secret-value' }]);
});

Deno.test('ProviderTechnicalError, non-JSON text and invented decisions all reject', async () => {
  const outcomes: Array<() => Promise<string>> = [
    () => Promise.reject(new ProviderTechnicalError('RATE_LIMITED')),
    () => Promise.reject(new ProviderTechnicalError('TIMEOUT')),
    () => Promise.reject(new Error('socket hang up')),
    () => Promise.resolve('Lo siento, no puedo ayudar con eso.'),
    () => Promise.resolve('```json\n{"decision":"APPROVED","reason":"x"}\n```'),
    () => Promise.resolve('{"decision":"MAYBE","reason":"No se"}'),
    () => Promise.resolve('{"decision":"APPROVED"}'),
    () => Promise.resolve('{"decision":"APPROVED","reason":"x","points":50}'),
    () => Promise.resolve(''),
  ];
  for (const outcome of outcomes) {
    const { factory } = factoryReturning(outcome);
    await assertRejects(() => createProductionValidator(env, factory).validate(INPUT));
  }
});

Deno.test('non-image bytes reject without calling the executor', async () => {
  let called = 0;
  const { factory } = factoryReturning(() => {
    called++;
    return Promise.resolve('{"decision":"APPROVED","reason":"x"}');
  });
  await assertRejects(() =>
    createProductionValidator(env, factory).validate({
      ...INPUT,
      originalImageBytes: new Uint8Array([1, 2, 3, 4]),
    })
  );
  assertEquals(called, 0);
});

Deno.test('onDiagnostic logs only coarse fields and never secrets, prompts or bytes', () => {
  const captured: unknown[][] = [];
  const original = console.warn;
  console.warn = (...args: unknown[]) => {
    captured.push(args);
  };
  try {
    // Wire the real hook through the factory the validator hands it, with a hostile diagnostic.
    let hook: ((d: Parameters<typeof logProviderDiagnostic>[0]) => void) | undefined;
    const validator = createProductionValidator(env, (_credentials, options) => {
      hook = options?.onDiagnostic;
      return () => Promise.reject(new ProviderTechnicalError('UNAVAILABLE'));
    });
    return assertRejects(() => validator.validate(INPUT)).then(() => {
      assert(hook !== undefined, 'the validator must pass onDiagnostic to the executor');
      hook({
        stage: 'INFERENCE',
        errorName: 'APICallError',
        status: 429,
        errorCode: 'rate_limited',
        causeName: 'TypeError',
        durationMs: 1234,
        // Fields a provider error could carry; the logger must not forward them.
        ...({ token: 'token-secret-value', prompt: 'system prompt', body: 'raw model answer' } as object),
      } as Parameters<typeof logProviderDiagnostic>[0]);
      assertEquals(captured.length, 1);
      const logged = JSON.stringify(captured);
      assertEquals(captured[0][1], {
        stage: 'INFERENCE',
        errorName: 'APICallError',
        status: 429,
        errorCode: 'rate_limited',
        durationMs: 1234,
      });
      for (const secret of ['token-secret-value', 'acct-test', 'system prompt', 'raw model answer']) {
        assert(!logged.includes(secret), `diagnostic leaked ${secret}`);
      }
    }).finally(() => {
      console.warn = original;
    });
  } catch (error) {
    console.warn = original;
    throw error;
  }
});
