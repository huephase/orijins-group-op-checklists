import type { SessionStore } from '@fastify/session';
import type { PrismaClient } from '@prisma/client';

export class PrismaSessionStore implements SessionStore {
  constructor(private readonly prisma: PrismaClient) {}

  all(callback: (error?: Error | null, result?: unknown) => void): void {
    void this.prisma.session
      .findMany()
      .then((rows) => callback(null, rows.map((row) => ({ sid: row.sid, sess: JSON.parse(row.data) }))))
      .catch((error) => callback(error));
  }

  destroy(sid: string, callback: (error?: Error | null) => void): void {
    void this.prisma.session.deleteMany({ where: { sid } }).then(() => callback()).catch(callback);
  }

  clear(callback: (error?: Error | null) => void): void {
    void this.prisma.session.deleteMany({}).then(() => callback()).catch(callback);
  }

  length(callback: (error?: Error | null, length?: number) => void): void {
    void this.prisma.session.count().then((length) => callback(null, length)).catch(callback);
  }

  get(sid: string, callback: (error?: Error | null, session?: unknown) => void): void {
    void this.prisma.session
      .findUnique({ where: { sid } })
      .then((row) => callback(null, row ? JSON.parse(row.data) : undefined))
      .catch((error) => callback(error));
  }

  set(sid: string, session: any, callback: (error?: Error | null) => void): void {
    const expiresAt = session?.cookie?.expires ? new Date(session.cookie.expires) : new Date(Date.now() + 12 * 60 * 60 * 1000);
    const data = JSON.stringify(session);
    void this.prisma.session
      .upsert({
        where: { sid },
        create: { sid, expiresAt, data },
        update: { expiresAt, data },
      })
      .then(() => callback())
      .catch(callback);
  }
}
