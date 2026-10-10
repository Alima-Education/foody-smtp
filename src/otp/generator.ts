import { randomInt } from 'node:crypto';

export function generateCode(length: number): string {
  return String(randomInt(0, 10 ** length)).padStart(length, '0');
}
