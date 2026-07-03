import { describe, expect, it } from 'vitest';
import { nextSubmissionState } from '../src/forms/formStateMachine.js';
import { formRegistry } from '../src/forms/registry.js';
import { createPayloadSchema } from '../src/forms/schemas.js';

describe('form lifecycle', () => {
  it('routes forms through verification when enabled', () =>
    expect(nextSubmissionState('DRAFT', 'submit', true)).toBe('PENDING_VERIFICATION'));
  it('locks submitted forms', () =>
    expect(() => nextSubmissionState('SUBMITTED', 'submit')).toThrow(/Invalid/));
});

describe('generated form validation', () => {
  it('rejects a missing required answer', () => {
    const schema = createPayloadSchema(formRegistry.daily_opening_checklist);
    expect(schema.safeParse({}).success).toBe(false);
  });
});
