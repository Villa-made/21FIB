// Production adapter of the AI validator port (T13.d). Composes C's ai/validator.ts with credentials
// read from server secrets at call time. Failures are always rejections, never a decision: the
// workflow turns them into TECHNICAL_ERROR (fail closed). Nothing here returns APPROVED by itself.
// Secrets: https://supabase.com/docs/guides/functions/secrets
import {
  type CloudflareVisionCredentials,
  type CloudflareVisionOptions,
  createCloudflareVisionExecutor,
  type ProviderDiagnostic,
  validateVisionEvidence,
  type VisionTextExecutor,
} from '../ai/validator.ts';
import type { EvidenceValidator } from './ports.ts';

export type VisionExecutorFactory = (
  credentials: CloudflareVisionCredentials,
  options?: CloudflareVisionOptions,
) => VisionTextExecutor;

/**
 * Server-side telemetry. Only coarse, non-sensitive fields: never the token, the prompt, the image
 * bytes or the model response (the diagnostic type does not even carry them).
 */
export function logProviderDiagnostic(diagnostic: ProviderDiagnostic): void {
  console.warn('ai validation failed', {
    stage: diagnostic.stage,
    errorName: diagnostic.errorName,
    status: diagnostic.status,
    errorCode: diagnostic.errorCode,
    durationMs: diagnostic.durationMs,
  });
}

/**
 * Credentials are read on every call, so a secret added or removed in Supabase takes effect on the
 * next validation. Missing credentials reject with a generic error and never reach the provider.
 */
export function createProductionValidator(
  env: (name: string) => string | undefined = (name) => Deno.env.get(name),
  executorFactory: VisionExecutorFactory = createCloudflareVisionExecutor,
): EvidenceValidator {
  return {
    validate(input) {
      const accountId = env('CLOUDFLARE_ACCOUNT_ID') ?? '';
      const apiToken = env('CLOUDFLARE_AUTH_TOKEN') ?? '';
      if (accountId === '' || apiToken === '') {
        return Promise.reject(new Error('AI validator is not configured'));
      }
      return validateVisionEvidence(
        input,
        executorFactory({ accountId, apiToken }, { onDiagnostic: logProviderDiagnostic }),
      );
    },
  };
}
