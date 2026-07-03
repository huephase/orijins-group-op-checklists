import { loadConfig } from './config/loadConfig.js';
import { loadEnvironment } from './config/env.js';
import { buildApp } from './app.js';

const env = loadEnvironment();
const config = await loadConfig();
const app = await buildApp(config, env);

const close = async (signal: string) => {
  app.log.info({ signal }, 'shutting down');
  await app.close();
  process.exit(0);
};
process.on('SIGTERM', () => void close('SIGTERM'));
process.on('SIGINT', () => void close('SIGINT'));
await app.listen({ host: env.HOST, port: env.PORT });
