import type { Mailer } from '../mail/mailer.ts';
import { otpEmail } from '../mail/templates/otp.ts';
import { generateCode } from './generator.ts';
import type { OtpHasher } from './hasher.ts';
import type { OtpStore } from './store.ts';
import { OtpError } from './types.ts';

export interface OtpServiceOptions {
  length: number;
  ttlSeconds: number;
  maxAttempts: number;
  resendCooldownSeconds: number;
  appName?: string;
}

export interface OtpServiceDeps {
  store: OtpStore;
  mailer: Mailer;
  hasher: OtpHasher;
  options: OtpServiceOptions;
  now?: () => number;
}

export class OtpService {
  private readonly store: OtpStore;
  private readonly mailer: Mailer;
  private readonly hasher: OtpHasher;
  private readonly options: OtpServiceOptions;
  private readonly now: () => number;

  constructor({ store, mailer, hasher, options, now = Date.now }: OtpServiceDeps) {
    this.store = store;
    this.mailer = mailer;
    this.hasher = hasher;
    this.options = options;
    this.now = now;
  }

  async request(email: string, purpose = 'default'): Promise<{ expiresInSeconds: number }> {
    const { key, identity, normalized } = this.identify(email, purpose);
    const { ttlSeconds, resendCooldownSeconds, length, appName } = this.options;
    const now = this.now();

    const existing = await this.store.get(key);
    if (existing) {
      const waitMs = existing.sentAt + resendCooldownSeconds * 1000 - now;
      if (waitMs > 0) {
        throw new OtpError('COOLDOWN', 'Tunggu sebelum meminta kode lagi', Math.ceil(waitMs / 1000));
      }
    }

    const code = generateCode(length);
    await this.store.set(key, {
      hash: this.hasher.hash(identity, code),
      expiresAt: now + ttlSeconds * 1000,
      sentAt: now,
      attempts: 0,
    });

    try {
      await this.mailer.send(otpEmail({ to: normalized, code, expiresInMinutes: Math.ceil(ttlSeconds / 60), appName }));
    } catch (err) {
      // email gagal: batalkan supaya user tidak kena jeda untuk kode yang tidak pernah sampai
      if (existing) await this.store.set(key, existing);
      else await this.store.delete(key);
      throw err;
    }

    return { expiresInSeconds: ttlSeconds };
  }

  async verify(email: string, code: string, purpose = 'default'): Promise<void> {
    const { key, identity } = this.identify(email, purpose);
    const record = await this.store.get(key);

    if (!record || record.expiresAt <= this.now()) {
      if (record) await this.store.delete(key);
      throw new OtpError('EXPIRED', 'Kode kedaluwarsa atau tidak ditemukan');
    }

    if (this.hasher.matches(identity, code, record.hash)) {
      await this.store.delete(key); // sekali pakai
      return;
    }

    const attempts = record.attempts + 1;
    if (attempts >= this.options.maxAttempts) {
      await this.store.delete(key);
      throw new OtpError('TOO_MANY_ATTEMPTS', 'Terlalu banyak percobaan, minta kode baru');
    }
    await this.store.set(key, { ...record, attempts });
    throw new OtpError('INVALID', 'Kode salah');
  }

  private identify(email: string, purpose: string) {
    const normalized = email.trim().toLowerCase();
    const identity = `${normalized}|${purpose}`;
    return { key: `otp:${identity}`, identity, normalized };
  }
}
