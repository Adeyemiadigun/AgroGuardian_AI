import Redis from 'ioredis';
import logger from '../Utils/logger';

const RAW_REDIS_URL = (process.env.REDIS_URL || '').trim();
const REDIS_HOST = (process.env.REDIS_HOST || '127.0.0.1').trim();
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = (process.env.REDIS_PASSWORD || '').trim();

const maskUrl = (u: string) => u.replace(/:(?:[^@]+)@/g, ':***@');

let connectionLabel = `${REDIS_HOST}:${REDIS_PORT}`;

export const redisConnection = (() => {
  if (RAW_REDIS_URL) {
    // Allow providing host-only (e.g. "moral-...upstash.io:6379") and assume TLS.
    const hasScheme = RAW_REDIS_URL.includes('://');
    const normalizedUrl = hasScheme ? RAW_REDIS_URL : `rediss://${RAW_REDIS_URL}`;
    const useTls = normalizedUrl.startsWith('rediss://');

    connectionLabel = maskUrl(normalizedUrl);

    // Upstash typically requires TLS + password. If password isn't embedded in the URL,
    // ioredis can still use REDIS_PASSWORD.
    if (!REDIS_PASSWORD && !normalizedUrl.includes('@')) {
      logger.warn('REDIS_URL is set but no password provided (REDIS_PASSWORD or URL creds). Upstash may reject the connection.');
    }

    // If someone accidentally sets redis:// for a remote host, warn because many managed Redis providers require TLS.
    if (!useTls && /upstash\.io/i.test(normalizedUrl)) {
      logger.warn('Upstash Redis usually requires TLS. Use rediss:// in REDIS_URL to avoid ECONNRESET.');
    }

    return new Redis(normalizedUrl, {
      password: REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: null,
      tls: useTls ? {} : undefined,
    });
  }

  const useTls = REDIS_HOST !== '127.0.0.1' && REDIS_HOST !== 'localhost';
  connectionLabel = `${REDIS_HOST}:${REDIS_PORT}`;

  return new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASSWORD,
    maxRetriesPerRequest: null,
    tls: useTls ? {} : undefined,
  });
})();

redisConnection.on('error', (error) => {
  logger.error(`Redis Connection Error: ${error.message}`);
});

redisConnection.on('connect', () => {
  logger.info(`Successfully connected to Redis at ${connectionLabel}`);
});
