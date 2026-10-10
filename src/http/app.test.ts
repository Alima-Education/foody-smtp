import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { after, before, describe, it } from 'node:test';
import type { Config } from '../config/env.ts';
import type { Mailer, MailMessage } from '../mail/mailer.ts';
import { createHmacHasher } from '../otp/hasher.ts';
import { MemoryOtpStore } from '../otp/memory-store.ts';
import { OtpService } from '../otp/otp-service.ts';
import { createApp } from './app.ts';

const KEY = 'test-key';
const ORIGIN = 'https://app.example.com';

const config: Config = {
  smtp: { host: 'x', port: 465, user: 'x', pass: 'x' },
  mailFrom: 'x@x.com',
  otp: { secret: 's', length: 6, ttlSeconds: 300, maxAttempts: 5, resendCooldownSeconds: 60 },
  limits: { ratePerMinutePerIp: 1000, requestsPerEmailPerHour: 2, mailsPerDay: 4 },
  http: { port: 0, apiKey: KEY, allowedOrigins: [ORIGIN, 'http://127.0.0.1:5500'], trustProxy: undefined },
};

class FakeMailer implements Mailer {
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
  }
}

describe('HTTP app', () => {
  let server: Server;
  let base: string;
  let store: MemoryOtpStore;
  const mailer = new FakeMailer();

  before(async () => {
    store = new MemoryOtpStore();
    const otp = new OtpService({
      store,
      mailer,
      hasher: createHmacHasher('s'),
      options: config.otp,
    });
    server = createApp({ config, otp }).listen(0);
    await new Promise((r) => server.once('listening', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  after(() => {
    server.close();
    store.close();
  });

  const post = (path: string, body: unknown, headers: Record<string, string> = {}) =>
    fetch(base + path, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': KEY, ...headers },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    });

  it('tanpa API key → 401', async () => {
    const res = await post('/otp/request', { email: 'a@x.com' }, { 'x-api-key': 'salah' });
    assert.equal(res.status, 401);
  });

  it('JSON rusak → 400 ringkas, tanpa detail internal, tanpa x-powered-by', async () => {
    const res = await post('/otp/request', '{bukan json');
    assert.equal(res.status, 400);
    assert.deepEqual(await res.json(), { ok: false, error: 'Request tidak valid' });
    assert.equal(res.headers.get('x-powered-by'), null);
  });

  it('route tak dikenal → 404 JSON, bukan HTML', async () => {
    const res = await fetch(base + '/xyz');
    assert.equal(res.status, 404);
    assert.deepEqual(await res.json(), { ok: false, error: 'Endpoint tidak ditemukan' });
  });

  it('CORS: origin terdaftar dipantulkan, yang lain tidak', async () => {
    const ok = await fetch(base + '/otp/request', { method: 'OPTIONS', headers: { origin: ORIGIN } });
    assert.equal(ok.status, 204);
    assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
    const other = await fetch(base + '/otp/request', { method: 'OPTIONS', headers: { origin: 'https://jahat.com' } });
    assert.equal(other.headers.get('access-control-allow-origin'), null);
  });

  it('batas per email per jam: permintaan ke-3 ditolak 429', async () => {
    const r1 = await post('/otp/request', { email: 'Budi@x.com', purpose: 'p1' });
    const r2 = await post('/otp/request', { email: 'budi@x.com', purpose: 'p2' });
    const r3 = await post('/otp/request', { email: 'BUDI@x.com', purpose: 'p3' });
    assert.deepEqual([r1.status, r2.status, r3.status], [200, 200, 429]);
    assert.ok(r3.headers.get('retry-after'));
    assert.equal(mailer.sent.length, 2);
  });

  it('batas harian global: email ke-5 (semua orang) ditolak 429', async () => {
    // sudah 2 terkirim ke budi; 2 lagi ke orang lain lalu penuh
    assert.equal((await post('/otp/request', { email: 'c1@x.com' })).status, 200);
    assert.equal((await post('/otp/request', { email: 'c2@x.com' })).status, 200);
    assert.equal((await post('/otp/request', { email: 'c3@x.com' })).status, 429);
    assert.equal(mailer.sent.length, 4);
  });
});
