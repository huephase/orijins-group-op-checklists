import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { configSchema, type MainConfig } from './config.schema.js';

let cached: MainConfig | undefined;

export async function loadConfig(
  path = resolve(process.cwd(), '__main_config.json'),
): Promise<MainConfig> {
  if (cached) return cached;
  const raw: unknown = JSON.parse(await readFile(path, 'utf8'));
  cached = configSchema.parse(raw);
  return cached;
}

export function clearConfigCache(): void {
  cached = undefined;
}
