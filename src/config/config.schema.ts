import { z } from 'zod';

const hex = z.string().regex(/^#[0-9a-f]{6}$/i, 'must be a six-digit hex colour');
const tenant = z.object({
  displayName: z.string().min(1),
  hostname: z
    .string()
    .min(1)
    .transform((value) => value.toLowerCase()),
  logoPath: z.string().startsWith('/'),
  faviconPath: z.string().startsWith('/'),
  palette: z.object({ primary: hex, secondary: hex, accent: hex, background: hex, text: hex }),
});

export const configSchema = z.object({
  app: z.object({
    name: z.string().min(1),
    baseUrl: z.string().url(),
    timezoneOffset: z.string().regex(/^[+-](0\d|1[0-4]):[0-5]\d$/),
    defaultLocale: z.string().min(2),
  }),
  uploads: z.object({
    maxFileSizeMb: z.number().positive(),
    allowedImageMimeTypes: z.array(z.enum(['image/jpeg', 'image/png', 'image/webp'])).min(1),
    expirationDays: z.number().int().positive(),
    signedUrlTtlSeconds: z.number().int().positive(),
  }),
  security: z.object({
    rateLimitWindowMs: z.number().int().positive(),
    rateLimitMaxRequests: z.number().int().positive(),
    uploadRateLimitMaxRequests: z.number().int().positive(),
    sessionTtlHours: z.number().positive(),
  }),
  reports: z.object({
    weeklySendDay: z.enum([
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
      'Sunday',
    ]),
    monthlySendDay: z.number().int().min(1).max(28),
    sendHourUtc: z.number().int().min(0).max(23),
  }),
  tenants: z
    .record(z.string().regex(/^[a-z0-9-]+$/), tenant)
    .refine((value) => Object.keys(value).length > 0),
});

export type MainConfig = z.infer<typeof configSchema>;
export type TenantConfig = z.infer<typeof tenant>;
