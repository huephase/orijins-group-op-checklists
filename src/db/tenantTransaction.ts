import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from './prisma.js';

export type TenantTransaction = Prisma.TransactionClient;

export async function withTenant<T>(
  tenantId: string,
  operation: (tx: TenantTransaction) => Promise<T>,
  client: PrismaClient = prisma,
): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.current_tenant_id', ${tenantId}, true)`;
    return operation(tx);
  });
}
