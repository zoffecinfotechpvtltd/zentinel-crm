import * as OTPAuth from "otpauth";
import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "./password";

const ISSUER = "Zentinel";

export function generateSecret(): string {
  return new OTPAuth.Secret({ size: 20 }).base32;
}

export function buildOtpauthUri(secret: string, email: string): string {
  const totp = new OTPAuth.TOTP({ issuer: ISSUER, label: email, secret: OTPAuth.Secret.fromBase32(secret) });
  return totp.toString();
}

// Allows the code from one step before/after the current one too, so a
// slightly-off device clock (the single most common real-world 2FA support
// complaint) doesn't lock someone out.
export function verifyTotpCode(secret: string, code: string): boolean {
  const totp = new OTPAuth.TOTP({ issuer: ISSUER, secret: OTPAuth.Secret.fromBase32(secret) });
  return totp.validate({ token: code.trim(), window: 1 }) !== null;
}

export function generateBackupCodes(count = 8): string[] {
  return Array.from({ length: count }, () => crypto.randomBytes(5).toString("hex")); // 10 hex chars, e.g. "a1b2c3d4e5"
}

export async function hashBackupCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => hashPassword(c)));
}

// Consumes (removes) a matching backup code from the hashed list if found.
// Returns the updated list to persist, or null if no code matched.
export async function tryConsumeBackupCode(hashedCodes: string[], candidate: string): Promise<string[] | null> {
  for (let i = 0; i < hashedCodes.length; i++) {
    if (await verifyPassword(hashedCodes[i], candidate.trim())) {
      return hashedCodes.slice(0, i).concat(hashedCodes.slice(i + 1));
    }
  }
  return null;
}
