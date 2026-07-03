import { describe, expect, it } from 'vitest';
import { configSchema } from '../src/config/config.schema.js';

describe('main config', () => {
  it('rejects unsafe palette values', () => {
    const result = configSchema.safeParse({
      app: {},
      uploads: {},
      security: {},
      reports: {},
      tenants: { x: { palette: { primary: 'red' } } },
    });
    expect(result.success).toBe(false);
  });
});
