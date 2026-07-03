import { z } from 'zod';
import type { FormDefinition } from './types.js';

const optionalText = z.string().trim().optional().default('');

export function createPayloadSchema(definition: FormDefinition) {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const field of definition.fields) {
    let schema: z.ZodTypeAny;
    switch (field.type) {
      case 'checkbox':
        schema = z
          .union([z.literal('true'), z.literal('on'), z.literal(true)])
          .transform(() => true);
        break;
      case 'radio':
      case 'select':
        schema = z.enum(field.options as [string, ...string[]]);
        break;
      case 'photo':
        schema = z.string().uuid().or(z.literal(''));
        break;
      case 'signature':
        schema = z.string().startsWith('data:image/').max(500_000);
        break;
      default:
        schema = z.string().trim();
    }
    shape[field.name] = field.required
      ? schema.refine((v) => v !== '', `${field.label} is required`)
      : schema.optional().default('');
  }
  return z.object(shape).strict();
}

export const submissionEnvelopeSchema = z.object({
  idempotencyKey: z.string().uuid(),
  formVersion: z.coerce.number().int().positive(),
  values: z.record(z.unknown()),
  gps: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracy: z.number().nonnegative().optional(),
    })
    .nullable(),
  gpsUnavailableReason: optionalText,
  device: z
    .object({
      userAgent: z.string().max(500).optional(),
      clientTimestamp: z.string().datetime().optional(),
    })
    .default({}),
});
