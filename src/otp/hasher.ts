import { createHmac, timingSafeEqual } from 'node:crypto';

export interface OtpHasher {
  hash(identity: string, code: string): string;
  matches(identity: string, code: string, expectedHash: string): boolean;
}

export function createHmacHasher(secret: string): OtpHasher {
  const hash = (identity: string, code: string) =>
    createHmac('sha256', secret).update(`${identity}\n${code}`).digest('hex');

  return {
    hash,
    matches(identity, code, expectedHash) {
      const a = Buffer.from(hash(identity, code));
      const b = Buffer.from(expectedHash);
      return a.length === b.length && timingSafeEqual(a, b);
    },
  };
}
