import { resolve } from 'node:path';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import session from '@fastify/session';
import fastifyStatic from '@fastify/static';
import view from '@fastify/view';
import Fastify from 'fastify';
import nunjucks from 'nunjucks';
import { authRoutes } from './auth/auth.routes.js';
import { currentUserPlugin } from './auth/session.js';
import type { MainConfig } from './config/config.schema.js';
import type { Environment } from './config/env.js';
import { formRoutes } from './forms/form.routes.js';
import { tenantPlugin } from './tenants/tenant.middleware.js';

export async function buildApp(config: MainConfig, env: Environment) {
  const app = Fastify({
    logger: env.NODE_ENV !== 'test',
    trustProxy: env.TRUST_PROXY,
    bodyLimit: config.uploads.maxFileSizeMb * 1024 * 1024,
  });
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        connectSrc: ["'self'"],
      },
    },
  });
  await app.register(cookie);
  await app.register(session, {
    secret: env.SESSION_SECRET,
    cookieName: 'ops_session',
    cookie: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: config.security.sessionTtlHours * 60 * 60 * 1000,
    },
    saveUninitialized: false,
  });
  await app.register(formbody);
  await app.register(rateLimit, {
    max: config.security.rateLimitMaxRequests,
    timeWindow: config.security.rateLimitWindowMs,
  });
  await app.register(fastifyStatic, {
    root: resolve(process.cwd(), 'public'),
    prefix: '/assets/',
    decorateReply: false,
  });
  app.get('/sw.js', async (_request, reply) =>
    reply.type('application/javascript').sendFile('sw.js', resolve(process.cwd(), 'public')),
  );
  await app.register(view, {
    engine: { nunjucks },
    root: resolve(process.cwd(), 'templates'),
    options: {
      onConfigure: (environment: nunjucks.Environment) =>
        environment.addGlobal('appName', config.app.name),
    },
  });
  app.get('/health', async () => ({ status: 'ok' }));
  await app.register(tenantPlugin, { config });
  await app.register(currentUserPlugin);
  await app.register(authRoutes);
  await app.register(formRoutes);
  app.get('/', async (request, reply) =>
    request.currentUser
      ? reply.view('dashboard.njk', {
          title: 'Dashboard',
          user: request.currentUser,
          now: new Date().toISOString(),
        })
      : reply.redirect('/login'),
  );
  app.setErrorHandler(async (error, request, reply) => {
    request.log.error(error);
    const known = error instanceof Error ? error : new Error('Unexpected server error');
    const status =
      'statusCode' in known && typeof known.statusCode === 'number' ? known.statusCode : 500;
    if (request.url.startsWith('/api/'))
      return reply
        .code(status)
        .send({ error: status === 500 ? 'Unexpected server error' : known.message });
    if (status === 401) return reply.redirect('/login');
    return reply.code(status).view('errors/message.njk', {
      title: status === 403 ? 'Access denied' : 'Something went wrong',
      message: status === 500 ? 'Please try again shortly.' : known.message,
    });
  });
  return app;
}
