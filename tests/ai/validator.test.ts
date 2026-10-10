import { assertEquals } from 'jsr:@std/assert@1';
import { parseValidationResult } from '../../supabase/functions/api/ai/schema.ts';

Deno.test('parseValidationResult accepts an exact approved result and normalizes its reason', () => {
  const result = parseValidationResult(
    '{"decision":"APPROVED","reason":"  La evidencia coincide.  "}',
  );

  assertEquals(result, {
    decision: 'APPROVED',
    reason: 'La evidencia coincide.',
  });
});

Deno.test('parseValidationResult accepts every contract decision', () => {
  for (const decision of ['APPROVED', 'NEEDS_EVIDENCE', 'REJECTED']) {
    assertEquals(
      parseValidationResult(JSON.stringify({ decision, reason: 'Motivo comprensible.' })),
      { decision, reason: 'Motivo comprensible.' },
    );
  }
});

Deno.test('parseValidationResult fails closed for malformed or non-strict provider output', () => {
  const cases = [
    '```json\n{"decision":"APPROVED","reason":"No aceptar"}\n```',
    '{"decision":"APPROVED"}',
    '{"decision":"UNKNOWN","reason":"No aceptar"}',
    '{"decision":"APPROVED","reason":"   "}',
    '{"decision":"APPROVED","reason":"No aceptar","extra":true}',
    'not json',
  ];

  for (const raw of cases) assertEquals(parseValidationResult(raw), null);
});

Deno.test('parseValidationResult rejects an oversized or control-character reason', () => {
  assertEquals(
    parseValidationResult(JSON.stringify({ decision: 'REJECTED', reason: 'a'.repeat(501) })),
    null,
  );
  assertEquals(
    parseValidationResult('{"decision":"REJECTED","reason":"Texto\u0000oculto"}'),
    null,
  );
});
