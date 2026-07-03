import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { withTenant } from '../db/tenantTransaction.js';
import { verifyPassword } from './password.js';

const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .email()
    .transform((v) => v.toLowerCase()),
  password: z.string().min(1).max(200),
});

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get('/login', async (request, reply) => {
    if (request.session.userId) return reply.redirect('/');
    return reply.view('auth/login.njk', { title: 'Sign in' });
  });

  app.post(
    '/login',
    { config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success)
        return reply
          .code(400)
          .view('auth/login.njk', { title: 'Sign in', error: 'Enter a valid email and password.' });
      const user = await withTenant(request.tenant.id, (tx) =>
        tx.user.findUnique({
          where: { tenantId_email: { tenantId: request.tenant.id, email: parsed.data.email } },
          include: { roles: { select: { role: true } } },
        }),
      );
      if (!user?.active || !(await verifyPassword(user.passwordHash, parsed.data.password))) {
        return reply
          .code(401)
          .view('auth/login.njk', { title: 'Sign in', error: 'Email or password is incorrect.' });
      }
      await request.session.regenerate();
      request.session.userId = user.id;
      request.session.tenantId = request.tenant.id;
      request.session.roles = user.roles.map(({ role }) => role);
      return reply.redirect('/');
    },
  );

  app.post('/logout', async (request, reply) => {
    await request.session.destroy();
    return reply.redirect('/login');
  });
}
