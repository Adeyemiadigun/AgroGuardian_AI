import Redis from "ioredis";
import logger from "../Utils/logger";

const REDIS_HOST = process.env.REDIS_HOST || "127.0.0.1";
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || "";

export const redisConnection = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD,
  maxRetriesPerRequest: null,
  tls: REDIS_HOST !== "127.0.0.1" ? {} : undefined,
});

redisConnection.on("error", (error) => {
  logger.error(`Redis Connection Error: ${error.message}`);
});

redisConnection.on("connect", () => {
  logger.info(`Successfully connected to Redis at ${REDIS_HOST}:${REDIS_PORT}`);
});
