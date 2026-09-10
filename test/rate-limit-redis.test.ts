import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import Redis from 'ioredis';
import { RATE_LIMIT_SCRIPT } from '../src/lib/http.ts';

test('real Redis rate windows are atomic, expire, and repair orphaned counters', {
  skip: !process.env.REDIS_TEST_URL,
}, async () => {
  const client = new Redis(process.env.REDIS_TEST_URL!);
  const key = `audit-test:${randomUUID()}`;
  const increment = () => client.eval(RATE_LIMIT_SCRIPT, 1, key, 60);
  try {
    const counts = await Promise.all(Array.from({ length: 50 }, increment));
    assert.deepEqual(counts.map(Number).sort((a, b) => a - b), Array.from({ length: 50 }, (_, i) => i + 1));
    assert.ok(await client.ttl(key) > 0);
    await client.pexpire(key, 30000);
    await increment();
    assert.ok(await client.pttl(key) <= 30000, 'requests must not extend the fixed window');
    await client.set(key, 3);
    assert.equal(await client.ttl(key), -1);
    assert.equal(await increment(), 4);
    assert.ok(await client.ttl(key) > 0, 'older orphaned keys recover');
    await client.pexpire(key, 1);
    await new Promise((resolve) => setTimeout(resolve, 20));
    assert.equal(await increment(), 1);
  } finally {
    await client.del(key);
    await client.quit();
  }
});
