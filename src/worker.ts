import { loadConfig } from './config/loadConfig.js';
import { prisma } from './db/prisma.js';
import { cleanupExpiredUploads } from './uploads/upload.service.js';

const config = await loadConfig();
const storageDir = new URL('../tmp/uploads/', import.meta.url).pathname;

const interval = setInterval(async () => {
  const expiredSessions = await prisma.session.deleteMany({ where: { expiresAt: { lt: new Date() } } });
  const expiredUploads = await cleanupExpiredUploads({ storageDir, now: new Date() }).catch(() => 0);
  const dueReports = await prisma.reportJob.count({ where: { status: 'QUEUED' } });
  if (expiredSessions.count || expiredUploads || dueReports)
    console.info(
      { expiredSessions: expiredSessions.count, expiredUploads, dueReports },
      'worker maintenance cycle completed',
    );
}, 60_000);

const close = async () => {
  clearInterval(interval);
  await prisma.$disconnect();
  process.exit(0);
};

process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
