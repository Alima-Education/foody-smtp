import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createWindowLimiter } from './limiter.ts';

describe('createWindowLimiter', () => {
  it('menolak setelah batas, lalu boleh lagi setelah jendela lewat', () => {
    let clock = 0;
    const l = createWindowLimiter({ limit: 2, windowMs: 1000, now: () => clock });
    assert.deepEqual(l.take('a'), { ok: true });
    assert.deepEqual(l.take('a'), { ok: true });
    const blocked = l.take('a');
    assert.equal(blocked.ok, false);
    assert.equal(blocked.ok === false && blocked.retryAfterSeconds, 1);
    clock += 1001;
    assert.deepEqual(l.take('a'), { ok: true });
  });

  it('key berbeda tidak saling mempengaruhi', () => {
    const l = createWindowLimiter({ limit: 1, windowMs: 1000, now: () => 0 });
    assert.equal(l.take('a').ok, true);
    assert.equal(l.take('b').ok, true);
    assert.equal(l.take('a').ok, false);
  });
});
