import type { Prisma } from '@prisma/client';
import { recordAudit } from '../audit/audit.service.js';
import { withTenant } from '../db/tenantTransaction.js';
import { nextSubmissionState } from './formStateMachine.js';
import type { FormDefinition } from './types.js';

interface SubmitInput {
  tenantId: string;
  userId: string;
  definition: FormDefinition;
  idempotencyKey: string;
  values: Prisma.InputJsonValue;
  gps: { latitude: number; longitude: number; accuracy?: number | undefined } | null;
  gpsUnavailableReason: string;
  device: Prisma.InputJsonValue;
}

export async function submitForm(input: SubmitInput) {
  return withTenant(input.tenantId, async (tx) => {
    const existing = await tx.formSubmission.findUnique({
      where: {
        tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.idempotencyKey },
      },
    });
    if (existing) return existing;
    const setting = await tx.formSetting.findUnique({
      where: { tenantId_formKey: { tenantId: input.tenantId, formKey: input.definition.key } },
    });
    if (setting && !setting.enabled)
      throw Object.assign(new Error('This form is disabled'), { statusCode: 403 });
    const state = nextSubmissionState('DRAFT', 'submit', setting?.requiresVerification ?? false);
    const submission = await tx.formSubmission.create({
      data: {
        tenantId: input.tenantId,
        formKey: input.definition.key,
        formVersion: input.definition.version,
        state,
        values: input.values,
        idempotencyKey: input.idempotencyKey,
        submitterId: input.userId,
        gpsLatitude: input.gps?.latitude ?? null,
        gpsLongitude: input.gps?.longitude ?? null,
        gpsAccuracy: input.gps?.accuracy ?? null,
        gpsUnavailableReason: input.gpsUnavailableReason || null,
        deviceMetadata: input.device,
        submittedAt: state === 'SUBMITTED' ? new Date() : null,
      },
    });
    await recordAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'form_submission',
      entityId: submission.id,
      action: state,
    });
    return submission;
  });
}
