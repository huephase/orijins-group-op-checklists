import type { FastifyInstance, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { withTenant } from '../db/tenantTransaction.js';

export const currentUserPlugin = fp(async (app: FastifyInstance) => {
  app.decorateRequest('currentUser');
  app.addHook('preHandler', async (request) => {
    const { userId, tenantId } = request.session;
    if (!userId || tenantId !== request.tenant?.id) return;
    const user = await withTenant(tenantId, (tx) =>
      tx.user.findUnique({ where: { id: userId }, include: { roles: true } }),
    );
    if (user?.active)
      request.currentUser = {
        id: user.id,
        displayName: user.displayName,
        roles: user.roles.map(({ role }) => role),
      };
  });
});

export async function requireUser(request: FastifyRequest): Promise<void> {
  if (!request.currentUser)
    throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
}
