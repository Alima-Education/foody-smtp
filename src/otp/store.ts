import type { OtpRecord } from './types.ts';

export interface OtpStore {
  get(key: string): Promise<OtpRecord | undefined>;
  set(key: string, record: OtpRecord): Promise<void>;
  delete(key: string): Promise<void>;
}
