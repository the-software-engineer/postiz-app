import { Redis, RedisOptions } from 'ioredis';

// Create a mock Redis implementation for testing environments
class MockRedis {
  private data: Map<string, any> = new Map();

  async get(key: string) {
    return this.data.get(key);
  }

  async set(key: string, value: any) {
    this.data.set(key, value);
    return 'OK';
  }

  async del(key: string) {
    this.data.delete(key);
    return 1;
  }

  // Add other Redis methods as needed for your tests
}

export function redisOptionsForUrl(redisUrl: string): RedisOptions {
  const url = new URL(redisUrl);

  return {
    maxRetriesPerRequest: 1,
    connectTimeout: 10000,
    commandTimeout: 10000,
    ...(url.protocol === 'rediss:'
      ? {
          tls: {
            servername: url.hostname,
          },
        }
      : {}),
  };
}

// Use real Redis if REDIS_URL is defined, otherwise use MockRedis
export const ioRedis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, redisOptionsForUrl(process.env.REDIS_URL))
  : (new MockRedis() as unknown as Redis); // Type cast to Redis to maintain interface compatibility
