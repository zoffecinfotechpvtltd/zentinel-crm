import crypto from "node:crypto";

export function generateRawToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

export function hashToken(rawToken: string): string {
  return crypto.createHash("sha256").update(rawToken).digest("hex");
}

// Used by dev/test seed scripts so no fixed password string ever sits in
// source — each seed run gets its own random credentials, printed once.
export function generateRandomPassword(): string {
  return crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "x");
}
