import { randomUUID } from 'node:crypto';
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

interface DraftInput {
  tenantId: string;
  userId: string;
  definition: FormDefinition;
  values: Prisma.InputJsonValue;
}

interface VerifyInput {
  tenantId: string;
  userId: string;
  submissionId: string;
  verifierId?: string | null;
  metadata?: Prisma.InputJsonValue;
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

export async function saveDraft(input: DraftInput) {
  return withTenant(input.tenantId, async (tx) => {
    const existing = await tx.formSubmission.findFirst({
      where: {
        tenantId: input.tenantId,
        formKey: input.definition.key,
        submitterId: input.userId,
        state: 'DRAFT',
      },
      orderBy: { createdAt: 'desc' },
    });
    if (existing)
      return tx.formSubmission.update({
        where: { id: existing.id },
        data: { values: input.values },
      });
    return tx.formSubmission.create({
      data: {
        tenantId: input.tenantId,
        formKey: input.definition.key,
        formVersion: input.definition.version,
        state: 'DRAFT',
        values: input.values,
        idempotencyKey: randomUUID(),
        submitterId: input.userId,
      },
    });
  });
}

export async function assignVerifier(input: VerifyInput) {
  return withTenant(input.tenantId, async (tx) => {
    const assignment = await tx.verificationAssignment.upsert({
      where: { submissionId: input.submissionId },
      create: {
        tenantId: input.tenantId,
        submissionId: input.submissionId,
        verifierId: input.verifierId ?? null,
      },
      update: { verifierId: input.verifierId ?? null },
    });
    await recordAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'verification_assignment',
      entityId: assignment.id,
      action: 'assign',
      metadata: input.metadata,
    });
    return assignment;
  });
}

export async function verifySubmission(input: VerifyInput) {
  return withTenant(input.tenantId, async (tx) => {
    const submission = await tx.formSubmission.findUnique({
      where: { id: input.submissionId },
      include: { verification: true },
    });
    if (!submission) throw Object.assign(new Error('Submission not found'), { statusCode: 404 });
    const updated = await tx.formSubmission.update({
      where: { id: submission.id },
      data: {
        state: 'SUBMITTED',
        submittedAt: new Date(),
        verification: {
          upsert: {
            create: {
              tenantId: input.tenantId,
              verifierId: input.verifierId ?? input.userId,
              verifiedAt: new Date(),
            },
            update: {
              verifierId: input.verifierId ?? input.userId,
              verifiedAt: new Date(),
            },
          },
        },
      },
    });
    await recordAudit(tx, {
      tenantId: input.tenantId,
      userId: input.userId,
      entityType: 'form_submission',
      entityId: updated.id,
      action: 'verify',
      metadata: input.metadata,
    });
    return updated;
  });
}
