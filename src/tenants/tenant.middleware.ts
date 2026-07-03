import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import type { MainConfig } from '../config/config.schema.js';
import { prisma } from '../db/prisma.js';

function hostnameOf(host: string): string {
  const normalized = host.trim().toLowerCase();
  return normalized.startsWith('[')
    ? normalized.slice(1, normalized.indexOf(']'))
    : (normalized.split(':')[0] ?? normalized);
}

export const tenantPlugin = fp(async (app: FastifyInstance, options: { config: MainConfig }) => {
  app.addHook('onRequest', async (request, reply) => {
    if (request.url === '/health' || request.url.startsWith('/assets/') || request.url === '/sw.js')
      return;
    const hostname = hostnameOf(request.hostname);
    const entry = Object.entries(options.config.tenants).find(
      ([, config]) => config.hostname === hostname,
    );
    if (!entry)
      return reply.code(404).view('errors/message.njk', {
        title: 'Unknown restaurant',
        message: 'This hostname is not configured.',
      });
    const [slug, config] = entry;
    const tenant = await prisma.tenant.findUnique({
      where: { hostname },
      select: { id: true, slug: true },
    });
    if (!tenant)
      return reply.code(503).view('errors/message.njk', {
        title: 'Restaurant unavailable',
        message: 'The tenant has not been provisioned in the database.',
      });
    request.tenant = { id: tenant.id, slug, config };
  });
});
