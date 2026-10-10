export interface OtpRecord {
  hash: string;
  expiresAt: number; // epoch ms
  sentAt: number; // epoch ms, untuk jeda minta ulang
  attempts: number;
}

export type OtpErrorCode = 'COOLDOWN' | 'INVALID' | 'EXPIRED' | 'TOO_MANY_ATTEMPTS';

export class OtpError extends Error {
  readonly code: OtpErrorCode;
  readonly retryAfterSeconds: number | undefined;

  constructor(code: OtpErrorCode, message: string, retryAfterSeconds?: number) {
    super(message);
    this.name = 'OtpError';
    this.code = code;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
