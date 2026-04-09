export type QueueMode = 'redis' | 'inline';

export const getQueueMode = (): QueueMode => {
  const raw = (process.env.QUEUE_MODE || '').toLowerCase().trim();
  if (raw === 'redis' || raw === 'inline') return raw;

  // Safe default: avoid Redis/BullMQ locally unless explicitly enabled.
  return process.env.NODE_ENV === 'production' ? 'redis' : 'inline';
};

export const isRedisQueueEnabled = () => getQueueMode() === 'redis';
