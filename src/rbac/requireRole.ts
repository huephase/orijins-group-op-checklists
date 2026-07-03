import type { FastifyRequest } from 'fastify';
import type { Role } from '@prisma/client';

export const requireRole =
  (...allowed: Role[]) =>
  async (request: FastifyRequest): Promise<void> => {
    if (!request.currentUser)
      throw Object.assign(new Error('Authentication required'), { statusCode: 401 });
    if (!request.currentUser.roles.some((role) => allowed.includes(role)))
      throw Object.assign(new Error('You do not have permission to do that'), { statusCode: 403 });
  };
