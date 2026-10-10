import type { OtpStore } from './store.ts';
import type { OtpRecord } from './types.ts';

export class MemoryOtpStore implements OtpStore {
  private readonly records = new Map<string, OtpRecord>();
  private readonly timer: NodeJS.Timeout;

  constructor(cleanupIntervalMs = 60_000) {
    this.timer = setInterval(() => this.cleanup(), cleanupIntervalMs);
    this.timer.unref(); // jangan menahan proses tetap hidup
  }

  async get(key: string) {
    return this.records.get(key);
  }

  async set(key: string, record: OtpRecord) {
    this.records.set(key, record);
  }

  async delete(key: string) {
    this.records.delete(key);
  }

  close() {
    clearInterval(this.timer);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, record] of this.records) {
      if (record.expiresAt <= now) this.records.delete(key);
    }
  }
}
