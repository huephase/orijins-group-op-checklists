import type { FastifyInstance } from 'fastify';
import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import type { MainConfig } from '../config/config.schema.js';
import type { Environment } from '../config/env.js';
import { withTenant } from '../db/tenantTransaction.js';
import { requireRole } from '../rbac/requireRole.js';
import { formEditors } from '../rbac/roles.js';
import { detectMimeType, persistUpload, readUpload, signDownload, verifyDownload } from './upload.service.js';

export async function uploadRoutes(
  app: FastifyInstance,
  opts: { config: MainConfig; env: Environment },
): Promise<void> {
  const storageDir = resolve(process.cwd(), 'tmp', 'uploads');
  await mkdir(storageDir, { recursive: true });
  app.post('/api/uploads/presign', { preHandler: requireRole(...formEditors) }, async (request, reply) => {
    const body = request.body as { submissionId?: string; filename?: string; mimeType?: string };
    if (!body.submissionId || !body.filename || !body.mimeType)
      return reply.code(400).send({ error: 'submissionId, filename, and mimeType are required' });
    if (!opts.config.uploads.allowedImageMimeTypes.includes(body.mimeType as never))
      return reply.code(415).send({ error: 'Unsupported media type' });
    const expiresAt = new Date(Date.now() + opts.config.uploads.expirationDays * 86400000);
    return reply.send({
      uploadId: body.submissionId,
      uploadUrl: `/api/uploads/${body.submissionId}/blob`,
      expiresAt: expiresAt.toISOString(),
    });
  });
  app.put('/api/uploads/:submissionId/blob', { preHandler: requireRole(...formEditors) }, async (request, reply) => {
    const raw = request.body as Buffer;
    const mimeType = request.headers['content-type']?.split(';')[0] || '';
    if (!opts.config.uploads.allowedImageMimeTypes.includes(mimeType as never))
      return reply.code(415).send({ error: 'Unsupported media type' });
    if (raw.byteLength > opts.config.uploads.maxFileSizeMb * 1024 * 1024)
      return reply.code(413).send({ error: 'File too large' });
    const detected = detectMimeType(raw);
    if (detected !== mimeType) return reply.code(422).send({ error: 'File signature does not match MIME type' });
    const file = await persistUpload({
      storageDir,
      tenantId: request.tenant.id,
      submissionId: request.params.submissionId,
      originalFilename: 'upload',
      mimeType,
      body: raw,
      expiresAt: new Date(Date.now() + opts.config.uploads.expirationDays * 86400000),
    });
    return reply.send({ id: file.id, generatedFilename: file.generatedFilename });
  });
  app.post('/api/uploads/complete', { preHandler: requireRole(...formEditors) }, async (request, reply) => {
    const body = request.body as { fileId?: string };
    if (!body.fileId) return reply.code(400).send({ error: 'fileId is required' });
    return reply.send({ ok: true });
  });
  app.get('/api/uploads/:fileId/signed-url', { preHandler: requireRole(...formEditors) }, async (request, reply) => {
    const file = await withTenant(request.tenant.id, (tx) =>
      tx.formSubmissionFile.findUnique({ where: { id: request.params.fileId } }),
    );
    if (!file) return reply.code(404).send({ error: 'File not found' });
    const expiresAt = new Date(Date.now() + opts.config.uploads.signedUrlTtlSeconds * 1000);
    const token = signDownload(opts.env.SESSION_SECRET, file.id, expiresAt);
    return reply.send({
      url: `/api/uploads/${file.id}/serve?expiresAt=${encodeURIComponent(expiresAt.toISOString())}&token=${token}`,
    });
  });
  app.get('/api/uploads/:fileId/serve', { preHandler: requireRole(...formEditors) }, async (request, reply) => {
    const file = await withTenant(request.tenant.id, (tx) =>
      tx.formSubmissionFile.findUnique({ where: { id: request.params.fileId } }),
    );
    if (!file) return reply.code(404).send({ error: 'File not found' });
    const expiresAt = String((request.query as { expiresAt?: string }).expiresAt ?? '');
    const token = String((request.query as { token?: string }).token ?? '');
    if (!expiresAt || !token || !verifyDownload(opts.env.SESSION_SECRET, file.id, expiresAt, token))
      return reply.code(403).send({ error: 'Invalid signed URL' });
    const data = await readUpload(storageDir, request.tenant.id, file.generatedFilename);
    return reply.type(file.mimeType).send(data);
  });
}
