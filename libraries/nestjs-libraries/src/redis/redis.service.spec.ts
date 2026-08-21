import { redisOptionsForUrl } from './redis.service';
import { describe, expect, it } from 'vitest';

describe('redisOptionsForUrl', () => {
  it('sets the TLS server name for rediss URLs', () => {
    expect(
      redisOptionsForUrl('rediss://:secret@redis.example.com:6379')
    ).toMatchObject({
      tls: {
        servername: 'redis.example.com',
      },
    });
  });

  it('does not add TLS options to redis URLs', () => {
    expect(redisOptionsForUrl('redis://localhost:6379')).not.toHaveProperty(
      'tls'
    );
  });

  it('bounds failed commands', () => {
    expect(redisOptionsForUrl('redis://localhost:6379')).toMatchObject({
      maxRetriesPerRequest: 1,
      connectTimeout: 10000,
      commandTimeout: 10000,
    });
  });
});
