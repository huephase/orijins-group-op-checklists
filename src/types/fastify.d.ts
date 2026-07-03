import type { Role } from '@prisma/client';
import type { TenantConfig } from '../config/config.schema.js';

declare module 'fastify' {
  interface Session {
    userId?: string;
    tenantId?: string;
    roles?: Role[];
  }
  interface FastifyRequest {
    tenant: { id: string; slug: string; config: TenantConfig };
    currentUser?: { id: string; displayName: string; roles: Role[] };
  }
}

export {};
