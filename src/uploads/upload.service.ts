import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { prisma } from '../db/prisma.js';
import { withTenant } from '../db/tenantTransaction.js';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPG_SIG = Buffer.from([0xff, 0xd8, 0xff]);
const WEBP_SIG = Buffer.from('RIFF');

export function generatedFilename(fileId: string, mimeType: string): string {
  const ext =
    mimeType === 'image/jpeg' ? 'jpg' : mimeType === 'image/png' ? 'png' : mimeType === 'image/webp' ? 'webp' : 'bin';
  return `${fileId}.${ext}`;
}

export function detectMimeType(buffer: Buffer): string | null {
  if (buffer.subarray(0, 4).equals(WEBP_SIG) && buffer.subarray(8, 12).equals(Buffer.from('WEBP')))
    return 'image/webp';
  if (buffer.subarray(0, 4).equals(PNG_SIG)) return 'image/png';
  if (buffer.subarray(0, 3).equals(JPG_SIG)) return 'image/jpeg';
  return null;
}

export function signDownload(secret: string, fileId: string, expiresAt: Date): string {
  return createHmac('sha256', secret).update(`${fileId}.${expiresAt.toISOString()}`).digest('hex');
}

export function verifyDownload(secret: string, fileId: string, expiresAt: string, token: string): boolean {
  const expected = signDownload(secret, fileId, new Date(expiresAt));
  const left = Buffer.from(expected);
  const right = Buffer.from(token);
  return left.length === right.length && timingSafeEqual(left, right);
}

export async function persistUpload(params: {
  storageDir: string;
  tenantId: string;
  submissionId: string;
  originalFilename: string;
  mimeType: string;
  body: Buffer;
  expiresAt: Date;
}) {
  const fileId = randomUUID();
  const filename = generatedFilename(fileId, params.mimeType);
  const tenantDir = join(params.storageDir, params.tenantId);
  await mkdir(tenantDir, { recursive: true });
  await writeFile(join(tenantDir, filename), params.body);
  return withTenant(params.tenantId, async (tx) =>
    tx.formSubmissionFile.create({
      data: {
        tenantId: params.tenantId,
        submissionId: params.submissionId,
        s3Key: filename,
        originalFilename: params.originalFilename,
        generatedFilename: filename,
        mimeType: params.mimeType,
        byteSize: params.body.byteLength,
        checksum: createHmac('sha256', 'checksum').update(params.body).digest('hex'),
        expiresAt: params.expiresAt,
      },
    }),
  );
}

export async function readUpload(storageDir: string, tenantId: string, filename: string): Promise<Buffer> {
  return readFile(join(storageDir, tenantId, filename));
}

export async function cleanupExpiredUploads(params: { storageDir: string; now: Date }) {
  const tenants = await prisma.tenant.findMany({ select: { id: true } });
  let cleaned = 0;
  for (const tenant of tenants) {
    cleaned += await withTenant(tenant.id, async (tx) => {
      const expired = await tx.formSubmissionFile.findMany({
        where: { tenantId: tenant.id, deletedAt: null, expiresAt: { lte: params.now } },
      });
      for (const file of expired) {
        await rm(join(params.storageDir, tenant.id, file.s3Key), { force: true });
        await tx.formSubmissionFile.update({
          where: { id: file.id },
          data: { deletedAt: params.now },
        });
      }
      return expired.length;
    });
  }
  return cleaned;
}
