# MAIN_PLAN.md

# Lightweight Multitenant Restaurant Operations Forms App

## 1. Product Goal

Build a lightweight, secure, TypeScript-based web app for restaurant operations teams to complete, submit, verify, store, and report on daily, weekly, and monthly operational forms.

The first version should use hard-coded forms for speed, reliability, and lower complexity. The architecture must still leave a clean path for a future dynamic form builder.

The app should avoid market-app bloat by focusing on:

- Fast form completion on mobile and tablet devices.
- Offline-first checklist usage through PWA capabilities.
- Tenant-specific branding without per-tenant deployments.
- Strong tenant isolation using PostgreSQL Row Level Security.
- Clear submission, verification, reporting, and audit trails.
- Minimal external dependencies and no font/API calls for styling.

## 2. Recommended Stack

### Core Runtime

- Language: TypeScript.
- Backend: Fastify.
- Templating: Nunjucks.
- Database: PostgreSQL.
- ORM: Prisma.
- Validation: Zod.
- Sessions: secure HTTP-only cookie sessions backed by Redis or PostgreSQL session storage.
- Email: Postmark.
- Object storage: Amazon S3.
- Containers: Docker and Docker Compose.
- Linting and formatting: ESLint, Prettier, TypeScript strict mode.
- Testing: Vitest for unit tests, Playwright for end-to-end tests.

### Frontend Approach

- Server-rendered pages with Nunjucks.
- Progressive enhancement using small TypeScript modules.
- PWA service worker for offline form drafts and queued submissions.
- No client-side SPA framework in phase one unless a future form builder requires it.
- System font stack only:

```css
font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
```

## 3. Core Principles

- Keep the app modular, DRY, and boring in the best possible way.
- Store critical secrets only in `.env`.
- Store non-secret operational settings in `__main_config.json`.
- Keep all timestamps in UTC in the database and application logic.
- Render timestamps as UTC+4 in the UI.
- Use tenant-aware middleware and PostgreSQL RLS for tenant isolation.
- Treat offline submissions as first-class data, not as a temporary hack.
- Avoid hard-coded limits inside business logic; read limits from config.
- Use reusable form rendering components/macros for hard-coded forms.
- Keep file uploads private by default and serve them through signed URLs.

## 4. Configuration Strategy

Use `.env` only for secrets and deployment-critical values:

```env
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=...
POSTMARK_SERVER_TOKEN=...
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
AWS_REGION=me-central-1
S3_BUCKET=...
```

Use `__main_config.json` for app-wide configurable settings:

```json
{
  "app": {
    "name": "Restaurant Operations Forms",
    "baseUrl": "https://ops.example.com",
    "timezoneOffset": "+04:00",
    "defaultLocale": "en"
  },
  "uploads": {
    "maxFileSizeMb": 10,
    "allowedImageMimeTypes": ["image/jpeg", "image/png", "image/webp"],
    "expirationDays": 60,
    "signedUrlTtlSeconds": 900
  },
  "security": {
    "rateLimitWindowMs": 60000,
    "rateLimitMaxRequests": 120,
    "uploadRateLimitMaxRequests": 20,
    "sessionTtlHours": 12
  },
  "reports": {
    "weeklySendDay": "Monday",
    "monthlySendDay": 1,
    "sendHourUtc": 5
  },
  "tenants": {
    "orijins": {
      "displayName": "Orijins",
      "hostname": "orijins.example.com",
      "logoPath": "/assets/tenants/orijins/logo.svg",
      "faviconPath": "/assets/tenants/orijins/favicon.ico",
      "palette": {
        "primary": "#111111",
        "secondary": "#f3f3f3",
        "accent": "#9a6b3f",
        "background": "#ffffff",
        "text": "#171717"
      }
    }
  }
}
```

The app should load and validate `__main_config.json` at startup using Zod. Invalid config should fail fast.

## 5. User Roles

| Role | Purpose |
|---|---|
| Super Admin | Platform-wide access, tenant creation, system configuration, emergency support. |
| Admin | Tenant-level administration, users, form settings, verification rules, reports. |
| Manager | Completes and submits operational forms, can trigger verification workflows. |
| Contributor | Completes assigned forms and verifies forms that require secondary verification. |
| Viewer | Read-only access to submitted forms and dashboards. |
| Auditor | Read-only access with expanded audit trail and export/report permissions. |

## 6. Form States

| State | Meaning | Editable |
|---|---|---|
| Draft | Form started but not submitted. | Yes, by owner or permitted role. |
| Pending Verification | Submitted form requires secondary verification. | Yes, by assigned verifier only. |
| Submitted | Final submitted form. | No normal editing; corrections require an admin-controlled amendment flow later. |

State transitions:

- `Draft -> Submitted` when no secondary verification is required.
- `Draft -> Pending Verification` when verification is required.
- `Pending Verification -> Submitted` when assigned verifier reviews, edits if needed, signs, and submits.
- `Submitted` is final and locked.

Every state change must create an audit event.

## 7. Required Submission Metadata

Every form submission must capture:

- UTC timestamp.
- Rendered display timestamp in UTC+4.
- User ID.
- Tenant ID.
- Form key/version.
- Device/browser metadata where reasonable.
- GPS latitude and longitude.
- GPS accuracy if provided by the browser.
- Signature data if required.
- Verification user, timestamp, and signature if secondary verification is enabled.

If GPS is unavailable, the form can either block submission or allow submission with a required reason. This behavior should be configurable per form.

## 8. Multitenancy and Branding

Tenancy should be resolved by hostname or subdomain.

Request flow:

1. Read hostname from request.
2. Resolve tenant from database or validated config cache.
3. Attach `tenantId`, tenant slug, branding, and palette to request context.
4. Set PostgreSQL session variable for RLS before tenant-scoped queries.
5. Render common main header and tenant secondary header.

Branding requirements:

- Common main header across all tenants.
- Secondary tenant header with logo, tenant name, color palette, and tenant navigation.
- Tenant favicon.
- Tenant-specific CSS variables generated from config or database settings.

## 9. PostgreSQL RLS Strategy

Use PostgreSQL Row Level Security as a mandatory security layer for tenant-owned tables.

Every tenant-scoped table should include:

```sql
tenant_id uuid not null references tenants(id)
```

Example policy:

```sql
alter table form_submissions enable row level security;

create policy tenant_isolation_form_submissions
on form_submissions
using (tenant_id = current_setting('app.current_tenant_id')::uuid)
with check (tenant_id = current_setting('app.current_tenant_id')::uuid);
```

For each request, set the tenant context inside a transaction:

```sql
select set_config('app.current_tenant_id', $1, true);
```

Implementation rule:

- All tenant-scoped reads/writes must happen through a transaction helper that sets `app.current_tenant_id`.
- Super Admin platform operations should use separate explicit service functions with carefully reviewed policies.

## 10. Database Model Draft

Core tables:

- `tenants`
- `tenant_branding`
- `users`
- `roles`
- `user_roles`
- `sessions`
- `form_definitions`
- `form_versions`
- `form_settings`
- `form_submissions`
- `form_submission_values`
- `form_submission_files`
- `form_signatures`
- `verification_assignments`
- `audit_events`
- `report_jobs`
- `report_recipients`
- `email_events`

Key model notes:

- Forms are hard-coded in TypeScript first, but each form should have a `form_key` and `version`.
- Submitted payloads should be stored as validated JSONB plus normalized metadata.
- File records should store S3 key, original filename, generated filename, MIME type, byte size, checksum, expiration timestamp, and deletion timestamp.
- Audit events should be append-only.
- Reports should store generation status, date range, recipients, and email provider response IDs.

## 11. Hard-Coded Forms First

Create a form registry in TypeScript:

```ts
export const formRegistry = {
  dailyOpeningChecklist: {
    key: "daily_opening_checklist",
    version: 1,
    title: "Daily Opening Checklist",
    schedule: "daily",
    requiresGps: true,
    requiresSignature: true,
    fields: [
      { type: "text", name: "openingManager", label: "Opening Manager", required: true },
      { type: "radio", name: "floorsClean", label: "Floors Clean", options: ["Yes", "No"], required: true },
      { type: "textarea", name: "notes", label: "Notes", required: false },
      { type: "photo", name: "frontAreaPhoto", label: "Front Area Photo", required: false },
      { type: "signature", name: "managerSignature", label: "Manager Signature", required: true }
    ]
  }
};
```

Use shared rendering macros for:

- Text input.
- Multiline input.
- Radio group.
- Dropdown.
- Checkbox/checklist item.
- Photo upload.
- Signature pad.
- Date/time display.
- GPS capture status.
- Submit/save draft controls.

This keeps hard-coded forms clean while avoiding repeated UI code.

## 12. Future Dynamic Form Builder Readiness

Do not build the dynamic builder in phase one, but prepare for it by:

- Using a consistent internal form schema.
- Versioning every form definition.
- Storing submitted payloads against form version.
- Keeping field renderers generic.
- Keeping validators generated from the form schema where possible.

Later, the admin dashboard can create and publish form definitions into the same schema used by hard-coded forms.

## 13. Validation Layer

Use Zod in three places:

- Config validation for `__main_config.json`.
- Request validation for params, query strings, and bodies.
- Form payload validation before saving drafts, submissions, and verification edits.

Validation rules:

- Client-side validation improves UX but is never trusted.
- Server-side Zod validation is mandatory.
- File validation must check MIME type, file extension, size, and actual file signature where practical.

## 14. Upload Strategy

Upload filename format:

```txt
{username}_{epoch_time}_{random_5_chars}.{extension}
```

Example:

```txt
johndoe_1782826559_jd8uj.jpg
```

Rules:

- Username must be sanitized to lowercase alphanumeric where possible.
- Epoch time should be seconds or milliseconds, consistently documented.
- Random segment must be generated with a secure random source.
- File extension must be derived from validated MIME type, not blindly trusted from the original upload.
- Max file size comes from `__main_config.json`.
- Default max size: 10 MB.
- Store uploads privately in S3.
- Store only file metadata and S3 key in PostgreSQL.
- Generate short-lived signed URLs when users view files.

Expiration:

- Every upload receives `expires_at = uploaded_at + expirationDays`.
- A scheduled cleanup job deletes expired S3 objects.
- Deleted files should be marked in the database with `deleted_at`.
- Keep audit events for deletion.

## 15. Signature Inputs

Use a lightweight canvas signature pad.

Store signatures as:

- SVG path data where possible, or
- PNG/WebP image if easier for compatibility.

Signature records should include:

- Submission ID.
- User ID.
- Tenant ID.
- Signature role: submitter or verifier.
- UTC timestamp.
- IP/device metadata where appropriate.
- S3 key or stored vector payload depending on final implementation.

## 16. Offline-First PWA Strategy

The app should support unreliable restaurant connectivity.

Offline capabilities:

- Cache app shell, CSS, JS, and form pages.
- Store draft form data locally using IndexedDB.
- Store queued submissions in IndexedDB.
- Store upload blobs temporarily in IndexedDB where browser limits allow.
- Show clear sync status: saved locally, queued, syncing, synced, failed.
- Retry queued submissions when connection returns.
- Prevent duplicate submissions using idempotency keys.

Recommended client storage:

- IndexedDB through a small wrapper library such as Dexie.

Offline submission model:

1. User opens form while online or from cached shell.
2. Draft saves locally.
3. User submits offline.
4. App records submission as queued with idempotency key.
5. When online, service worker or foreground sync sends payload.
6. Server validates, stores, and returns canonical submission ID.
7. Local queue marks item as synced.

Important rule:

- Final authority is always the server. Offline data must be revalidated during sync.

## 17. Rate Limiting and Throttling

Use rate limits for:

- Login.
- Password reset.
- Form submission.
- Draft save.
- File upload.
- Report generation.
- Admin actions.

Recommended approach:

- Use Fastify rate limit plugin backed by Redis for distributed deployments.
- Apply stricter limits to upload endpoints.
- Include tenant ID, user ID, IP address, and route in rate-limit keys where appropriate.
- Return user-friendly error pages/messages for legitimate users.

## 18. Admin Dashboard

Phase-one dashboard features:

- Tenant branding view/edit where permitted.
- User management.
- Role assignment.
- Form list.
- Enable/disable forms per tenant.
- Enable/disable secondary verification per form.
- Assign verifier role or specific verifier.
- Report recipient management.
- Upload retention setting display from config.
- Basic audit log viewer.

Later dashboard features:

- Dynamic form builder.
- Form schedule builder.
- Conditional logic.
- Advanced report designer.
- Export templates.

## 19. Reporting

Reporting types:

- On-demand reports.
- Weekly reports.
- Monthly reports.

Report filters:

- Tenant.
- Location/branch if branches are added.
- Form type.
- User.
- Date range.
- Status.
- Verification state.

Report outputs:

- HTML email summary through Postmark.
- CSV export.
- PDF export later if required.

Scheduled reporting:

- Use a background worker or scheduled job container.
- Read schedule settings from `__main_config.json`.
- Store job status in `report_jobs`.
- Email recipients using Postmark.
- Log provider message IDs in `email_events`.

## 20. API and Route Structure

Suggested server routes:

```txt
GET  /login
POST /login
POST /logout

GET  /
GET  /dashboard

GET  /forms
GET  /forms/:formKey/new
GET  /forms/:formKey/submissions/:submissionId
POST /api/forms/:formKey/draft
POST /api/forms/:formKey/submit
POST /api/forms/:formKey/verify

POST /api/uploads/presign
POST /api/uploads/complete
GET  /api/uploads/:fileId/signed-url

GET  /admin
GET  /admin/users
POST /admin/users
POST /admin/users/:userId/roles
GET  /admin/forms
POST /admin/forms/:formKey/settings
GET  /admin/reports
POST /admin/reports/run

GET  /api/offline/bootstrap
POST /api/offline/sync
```

## 21. CSS and Responsive Rules

Use only these responsive bands:

- Desktop.
- Tablet landscape.
- Tablet portrait.
- Mobile portrait.

Example:

```css
/* Mobile portrait: default */

@media (min-width: 768px) and (orientation: portrait) {
  /* Tablet portrait */
}

@media (min-width: 900px) and (orientation: landscape) {
  /* Tablet landscape */
}

@media (min-width: 1200px) {
  /* Desktop */
}
```

Design rules:

- Forms must be easy to complete on mobile.
- Touch targets should be large enough for restaurant floor usage.
- Avoid nested cards and heavy visual structure.
- Use tenant CSS variables for color.
- Keep layouts stable and simple.

## 22. Docker Structure

Recommended services:

- `app`: Fastify/Nunjucks TypeScript app.
- `postgres`: PostgreSQL.
- `redis`: sessions, rate limiting, queues.
- `worker`: report jobs, upload cleanup, scheduled tasks.

Suggested files:

```txt
Dockerfile
docker-compose.yml
.env.example
__main_config.json
package.json
tsconfig.json
eslint.config.js
prisma/schema.prisma
src/
templates/
public/
tests/
```

## 23. Proposed Source Structure

```txt
src/
  app.ts
  server.ts
  config/
    loadConfig.ts
    config.schema.ts
  db/
    prisma.ts
    tenantTransaction.ts
    rls.ts
  auth/
    auth.routes.ts
    session.ts
    password.ts
  tenants/
    tenant.middleware.ts
    tenant.service.ts
  rbac/
    roles.ts
    requireRole.ts
  forms/
    registry.ts
    schemas.ts
    form.routes.ts
    form.service.ts
    formStateMachine.ts
  uploads/
    upload.routes.ts
    upload.service.ts
    filename.ts
    cleanup.worker.ts
  reports/
    report.routes.ts
    report.service.ts
    report.worker.ts
  offline/
    offline.routes.ts
    sync.service.ts
  audit/
    audit.service.ts
  email/
    postmark.ts
  utils/
    time.ts
    idempotency.ts
    random.ts
```

## 24. Development Phases

### Phase 1: Foundation

Deliverables:

- TypeScript Fastify app.
- Nunjucks setup.
- Docker Compose with app, PostgreSQL, and Redis.
- Prisma setup and initial migrations.
- Config loader for `__main_config.json`.
- `.env.example`.
- ESLint, Prettier, TypeScript strict mode.
- Health check route.

Acceptance criteria:

- App starts with Docker Compose.
- Invalid config fails startup clearly.
- Database migrations run cleanly.

### Phase 2: Tenancy, Auth, Sessions, and RBAC

Deliverables:

- Tenant resolution middleware.
- Secure session cookie setup.
- Login/logout.
- User and role schema.
- Role-check middleware.
- PostgreSQL RLS policies for tenant-scoped tables.
- Tenant transaction helper.

Acceptance criteria:

- Tenant is resolved from hostname.
- Users can log in and see tenant-branded layout.
- RLS blocks cross-tenant access in tests.

### Phase 3: Form Registry and Drafts

Deliverables:

- Hard-coded form registry.
- Shared Nunjucks form macros.
- Draft save flow.
- Zod validation for form payloads.
- Basic form list and new form page.

Acceptance criteria:

- Manager can start and save a draft.
- Draft reloads correctly.
- Invalid data is rejected server-side.

### Phase 4: Submission and Verification Workflow

Deliverables:

- Form state machine.
- Submit flow with UTC timestamp and GPS coordinates.
- Signature input.
- Secondary verification settings.
- Pending Verification queue.
- Verifier edit and final submit flow.
- Audit events for state changes.

Acceptance criteria:

- Forms without verification become Submitted.
- Forms with verification become Pending Verification.
- Assigned Contributor can verify and finalize.
- Submitted forms are locked.

### Phase 5: Uploads and Expiration

Deliverables:

- S3 upload integration.
- File validation.
- Required filename template.
- Upload metadata records.
- Signed URL access.
- Scheduled expiration cleanup after configured days.

Acceptance criteria:

- Upload size limit is read from config.
- Files use the required generated filename format.
- Expired files are deleted from S3 and marked deleted in DB.

### Phase 6: Offline-First PWA

Deliverables:

- Web manifest.
- Service worker.
- IndexedDB draft storage.
- Offline queue for submissions.
- Idempotency keys.
- Sync endpoint.
- Sync status UI.

Acceptance criteria:

- User can fill a form offline.
- Submission queues offline.
- Submission syncs when connection returns.
- Duplicate sync attempts do not create duplicate submissions.

### Phase 7: Admin Dashboard

Deliverables:

- Admin landing page.
- User management.
- Role assignment.
- Form settings page.
- Secondary verification controls.
- Report recipient settings.
- Audit log viewer.

Acceptance criteria:

- Admin can enable verification per form.
- Admin can assign verifier role/specific verifier.
- Admin can manage users and roles.

### Phase 8: Reporting and Email

Deliverables:

- On-demand report generation.
- Weekly report worker.
- Monthly report worker.
- Postmark integration.
- Report job status records.
- CSV export.

Acceptance criteria:

- Admin can generate report on demand.
- Weekly and monthly reports email successfully.
- Email events are logged.

### Phase 9: Hardening, Testing, and Release

Deliverables:

- Unit tests for validation, state machine, filename generation, and config.
- Integration tests for RLS and tenant isolation.
- Playwright tests for main flows.
- Upload abuse/rate-limit tests.
- Security headers.
- Backup and restore notes.
- Production deployment guide.

Acceptance criteria:

- Test suite passes.
- Cross-tenant access tests fail safely.
- App can be deployed from Docker with documented environment variables.

## 25. Testing Priorities

Highest priority tests:

- RLS tenant isolation.
- Form state transitions.
- Verification permissions.
- Submitted form locking.
- Upload size/type validation.
- Filename generation.
- Expired file cleanup.
- Offline sync idempotency.
- Config validation.
- UTC storage and UTC+4 rendering.

## 26. Security Checklist

- Use HTTPS in production.
- Use secure, HTTP-only, same-site cookies.
- Hash passwords with Argon2id or bcrypt.
- Enforce CSRF protection on form posts.
- Validate all inputs with Zod.
- Use RLS for tenant-owned tables.
- Use signed URLs for private uploads.
- Sanitize file names and never trust original extensions.
- Apply rate limits to sensitive endpoints.
- Use security headers.
- Log important security events.
- Keep audit events append-only.
- Avoid exposing stack traces in production.

## 27. Operational Notes

- Database stores all timestamps in UTC.
- UI renders timestamps as UTC+4.
- Backups should include PostgreSQL data, config, and S3 metadata.
- S3 object lifecycle rules can be added as a backup to app-level cleanup.
- The worker service should handle report schedules and upload deletion.
- App settings changes in `__main_config.json` should be reloadable where safe, or require only an app restart, not a redeploy.

## 28. Future Enhancements

- Dynamic form builder.
- Branch/location hierarchy.
- Conditional form fields.
- QR-code form launch by station/location.
- PDF report exports.
- Advanced dashboard analytics.
- Push notifications.
- Multilingual UI.
- In-app comments on submissions.
- Amendment workflow for submitted forms.
- External BI export.

## 29. First Build Milestone

The first useful milestone should be:

- Dockerized app starts.
- One tenant works with custom branding.
- One hard-coded daily checklist works.
- User can save draft, submit with GPS and signature, and view final submission.
- RLS tenant isolation is tested.

This milestone proves the foundation without overbuilding the future dynamic form builder too early.
