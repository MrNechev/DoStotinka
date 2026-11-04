import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateRecoveryCodes,
  hotp,
  otpauthUrl,
  verifyTotp,
} from '../src/lib/totp';

// RFC 6238, appendix B (SHA-1).
const secret = Buffer.from('12345678901234567890');
const vectors: [number, string][] = [
  [59, '94287082'],
  [1111111109, '07081804'],
  [1111111111, '14050471'],
  [1234567890, '89005924'],
  [2000000000, '69279037'],
];

describe('totp', () => {
  it('matches the RFC 6238 test vectors', () => {
    for (const [seconds, code] of vectors) {
      expect(hotp(secret, Math.floor(seconds / 30), 8)).toBe(code);
    }
  });

  it('round-trips base32', () => {
    const encoded = base32Encode(secret);
    expect(encoded).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
    expect(base32Decode(encoded).equals(secret)).toBe(true);
    expect(base32Decode('gezd gnbv-gy3t qojq gezd gnbv gy3t qojq').equals(secret)).toBe(true);
  });

  it('accepts codes of the neighbouring steps once', () => {
    const b32 = base32Encode(secret);
    const now = 1_234_567_890_000;
    const step = Math.floor(now / 30_000);
    const prev = hotp(secret, step - 1);
    expect(verifyTotp(b32, prev, { now })).toBe(step - 1);
    expect(verifyTotp(b32, hotp(secret, step - 2), { now })).toBeNull();
    expect(verifyTotp(b32, prev, { now, lastUsedStep: step - 1 })).toBeNull();
    expect(
      verifyTotp(b32, `${hotp(secret, step).slice(0, 3)} ${hotp(secret, step).slice(3)}`, { now }),
    ).toBe(step);
    expect(verifyTotp(b32, 'abcdef', { now })).toBeNull();
  });

  it('builds otpauth links and recovery codes', () => {
    expect(otpauthUrl('ABC', 'me@example.com')).toBe(
      'otpauth://totp/DoStotinka%3Ame%40example.com?secret=ABC&issuer=DoStotinka&algorithm=SHA1&digits=6&period=30',
    );
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}$/);
  });
});
