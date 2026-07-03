import { randomUUID } from 'node:crypto';
import { loadConfig } from '../config/loadConfig.js';
import { prisma } from '../db/prisma.js';
import { hashPassword } from '../auth/password.js';
import { Role } from '../rbac/roles.js';

const config = await loadConfig();
const tenantSlug = process.env.PROVISION_TENANT_SLUG ?? 'orijins';
const tenant = config.tenants[tenantSlug];

if (!tenant) throw new Error(`Tenant config not found for slug ${tenantSlug}`);

const email = process.env.PROVISION_USER_EMAIL ?? 'admin@localhost';
const username = process.env.PROVISION_USER_USERNAME ?? 'admin';
const displayName = process.env.PROVISION_USER_DISPLAY_NAME ?? 'Local Admin';
const password = process.env.PROVISION_USER_PASSWORD ?? 'ChangeMe123!';

const tenantRow = await prisma.tenant.upsert({
  where: { hostname: tenant.hostname },
  create: {
    id: randomUUID(),
    slug: tenantSlug,
    displayName: tenant.displayName,
    hostname: tenant.hostname,
  },
  update: {
    slug: tenantSlug,
    displayName: tenant.displayName,
  },
});

const passwordHash = await hashPassword(password);
const user = await prisma.user.upsert({
  where: { tenantId_email: { tenantId: tenantRow.id, email } },
  create: {
    tenantId: tenantRow.id,
    email,
    username,
    displayName,
    passwordHash,
  },
  update: {
    username,
    displayName,
    passwordHash,
    active: true,
  },
});

await prisma.userRole.upsert({
  where: { userId_role: { userId: user.id, role: Role.ADMIN } },
  create: { tenantId: tenantRow.id, userId: user.id, role: Role.ADMIN },
  update: { tenantId: tenantRow.id },
});

for (const formKey of ['daily_opening_checklist', 'basic_test_checklist']) {
  await prisma.formSetting.upsert({
    where: { tenantId_formKey: { tenantId: tenantRow.id, formKey } },
    create: { tenantId: tenantRow.id, formKey, enabled: true, requiresVerification: false },
    update: { enabled: true },
  });
}

console.log(
  JSON.stringify(
    {
      tenant: { id: tenantRow.id, slug: tenantRow.slug, hostname: tenantRow.hostname },
      user: { id: user.id, email, username },
      password,
    },
    null,
    2,
  ),
);

await prisma.$disconnect();
