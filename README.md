# Restaurant Operations Forms

Phase-one foundation for the multitenant, offline-capable restaurant operations app described in [the main plan](docs/MAIN_PLAN.md).

## What is implemented

- Fastify + Nunjucks server-rendered application in strict TypeScript.
- Startup validation for secrets and `__main_config.json`.
- Hostname tenant resolution, tenant branding, RBAC, Argon2 authentication, and secure cookie sessions.
- Prisma domain model, tenant-scoped transaction helper, PostgreSQL RLS policies, and append-only audit protection.
- Versioned hard-coded form registry, generated Zod validation, lifecycle state machine, and idempotent submission service.
- Mobile-first form UI with GPS, signature capture, IndexedDB drafts/queue, automatic sync, and PWA shell caching.
- Docker images for the web app, PostgreSQL, and an opt-in worker/Redis deployment shape.

Upload, email, admin CRUD, and report generation are integration seams rather than pretend implementations: they need S3/Postmark credentials and product decisions before being exposed.

## Local setup

1. Copy `.env.example` to `.env` and replace `SESSION_SECRET` with at least 32 random characters.
2. Start PostgreSQL: `docker compose up -d postgres`.
3. Install and generate: `npm install && npm run prisma:generate`.
4. Create a migration from `prisma/schema.prisma`, review it, append the RLS statements from `prisma/rls.sql`, and apply it.
5. Provision the configured tenant and an initial admin using `npm run provision`.
6. Run `npm run dev` and open `http://localhost:3000`.

The application intentionally returns `503` until a `tenants` row exists for the configured hostname. This prevents silently running without database-backed tenant identity.

For a quick smoke test after login, open `/forms/basic_test_checklist/new`. It uses a minimal set of fields and skips GPS and signature capture so you can validate the full browser-to-server form flow quickly in Docker.

The provisioning script defaults to:

- tenant slug: `orijins`
- user email: `admin@localhost`
- username: `admin`
- password: `ChangeMe123!`

You can override those values with `PROVISION_TENANT_SLUG`, `PROVISION_USER_EMAIL`, `PROVISION_USER_USERNAME`, `PROVISION_USER_DISPLAY_NAME`, and `PROVISION_USER_PASSWORD`.

## Quality commands

```sh
npm run typecheck
npm test
npm run lint
npm run format:check
npm run build
```

## Security notes

All tenant-owned ORM work must use `withTenant`; it starts a transaction and sets the transaction-local `app.current_tenant_id`. The deployment database role must not own tables or have `BYPASSRLS`, otherwise PostgreSQL can bypass policies. Production should replace Fastify's in-memory development session store with a PostgreSQL or Redis store before horizontal scaling.
