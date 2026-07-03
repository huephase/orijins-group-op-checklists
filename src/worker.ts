import { loadConfig } from './config/loadConfig.js';
import { prisma } from './db/prisma.js';

const config = await loadConfig();
const interval = setInterval(async () => {
  // Integration seam for private S3 deletion and scheduled Postmark reports.
  // Jobs remain database-backed so multiple worker replicas can later claim them safely.
  const due = await prisma.reportJob.count({ where: { status: 'QUEUED' } });
  if (due)
    console.info(
      { due, sendHourUtc: config.reports.sendHourUtc },
      'report jobs awaiting a configured email provider',
    );
}, 60_000);
const close = async () => {
  clearInterval(interval);
  await prisma.$disconnect();
  process.exit(0);
};
process.on('SIGTERM', () => void close());
process.on('SIGINT', () => void close());
