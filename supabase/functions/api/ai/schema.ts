import {
  DECISIONS,
  type Decision,
  type ValidationResult,
} from '../domain/contracts.ts';

/** Keep an externally generated explanation bounded before any later persistence. */
export const MAX_VALIDATION_REASON_LENGTH = 500;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Accept only the exact internal validation contract. A malformed provider result
 * is deliberately represented by null so the caller can map it to a technical
 * error; it must never become an approval.
 */
export function parseValidationResult(raw: string): ValidationResult | null {
  let value: unknown;

  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }

  if (!isRecord(value)) return null;

  const keys = Object.keys(value).sort();
  if (keys.length !== 2 || keys[0] !== 'decision' || keys[1] !== 'reason') return null;
  if (typeof value.decision !== 'string' || !DECISIONS.includes(value.decision as Decision)) return null;
  if (typeof value.reason !== 'string') return null;

  const reason = value.reason.replace(/\s+/g, ' ').trim();
  if (
    reason.length === 0 ||
    reason.length > MAX_VALIDATION_REASON_LENGTH ||
    /[\u0000-\u001F\u007F]/.test(reason)
  ) {
    return null;
  }

  return { decision: value.decision as Decision, reason };
}
