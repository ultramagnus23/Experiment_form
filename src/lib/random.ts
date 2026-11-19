import { randomBytes, randomInt, createHash, timingSafeEqual } from 'node:crypto';

/** Fisher–Yates shuffle driven by a CSPRNG (crypto.randomInt is unbiased). */
export function shuffle<T>(input: readonly T[]): T[] {
  const a = [...input];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** One permuted block containing each of the four conditions exactly once, in random order. */
export function newPermutedBlock(): (1 | 2 | 3 | 4)[] {
  return shuffle([1, 2, 3, 4] as const) as (1 | 2 | 3 | 4)[];
}

/** Simple (unrestricted) randomization. */
export function simpleDraw(): 1 | 2 | 3 | 4 {
  return randomInt(1, 5) as 1 | 2 | 3 | 4;
}

const ID_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
export function newParticipantId(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ID_ALPHABET[randomInt(0, ID_ALPHABET.length)];
  return `P-${s}`;
}

export function newSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256hex(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}

export function safeEqualHex(a: string, b: string): boolean {
  const A = Buffer.from(a, 'hex');
  const B = Buffer.from(b, 'hex');
  return A.length === B.length && A.length > 0 && timingSafeEqual(A, B);
}
