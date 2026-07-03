import type { Prisma } from '@prisma/client';
import type { TenantTransaction } from '../db/tenantTransaction.js';

export async function recordAudit(
  tx: TenantTransaction,
  event: {
    tenantId: string;
    userId?: string;
    entityType: string;
    entityId: string;
    action: string;
    metadata?: Prisma.InputJsonValue;
  },
): Promise<void> {
  await tx.auditEvent.create({ data: event });
}
