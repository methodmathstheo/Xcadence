import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  opts: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

/**
 * scrypt parameters. N = 2^15 costs roughly 100ms on the deployment's single
 * shared core, which is the point: it is the whole defence if the SQLite file
 * ever leaks. maxmem has to be raised explicitly because Node's 32MB default
 * is below what N=32768, r=8 needs (128·N·r ≈ 33.5MB).
 */
const N = 1 << 15;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 192 * 1024 * 1024;

/** `scrypt$N$r$p$salt$digest`, both tails base64. Self-describing so the cost can be raised later without stranding old rows. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, salt64, key64] = parts;
  const salt = Buffer.from(salt64, "base64");
  const expected = Buffer.from(key64, "base64");
  let actual: Buffer;
  try {
    actual = await scryptAsync(password, salt, expected.length, {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: MAXMEM,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
