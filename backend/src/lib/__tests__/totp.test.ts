import { describe, it, expect } from "vitest";
import * as OTPAuth from "otpauth";
import { generateSecret, buildOtpauthUri, verifyTotpCode, generateBackupCodes, hashBackupCodes, tryConsumeBackupCode } from "../totp";

describe("TOTP secret + verification", () => {
  it("generates a base32 secret that round-trips through code generation and verification", () => {
    const secret = generateSecret();
    const totp = new OTPAuth.TOTP({ secret: OTPAuth.Secret.fromBase32(secret) });
    const code = totp.generate();
    expect(verifyTotpCode(secret, code)).toBe(true);
  });

  it("rejects a wrong code", () => {
    const secret = generateSecret();
    expect(verifyTotpCode(secret, "000000")).toBe(false);
  });

  it("builds a valid otpauth:// URI containing the issuer and account label", () => {
    const secret = generateSecret();
    const uri = buildOtpauthUri(secret, "admin@zoffec.com");
    expect(uri).toMatch(/^otpauth:\/\/totp\//);
    expect(uri).toContain("Zoffec%20Sentinel");
    expect(uri).toContain("admin%40zoffec.com");
  });
});

describe("backup codes", () => {
  // bcrypt at the app's real cost factor (12) times an 8-code linear scan
  // legitimately takes a few seconds — that's the actual login-time cost for
  // someone using a backup code, not a bug. Give the test room for it rather
  // than weakening the hash cost just to make it fast.
  it("generates unique-looking codes and can consume exactly one matching code", async () => {
    const codes = generateBackupCodes(8);
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);

    const hashed = await hashBackupCodes(codes);
    const remaining = await tryConsumeBackupCode(hashed, codes[3]);
    expect(remaining).not.toBeNull();
    expect(remaining!).toHaveLength(7);

    // the consumed code no longer matches anything in the returned list
    const secondAttempt = await tryConsumeBackupCode(remaining!, codes[3]);
    expect(secondAttempt).toBeNull();
  }, 15000);

  it("returns null for a code that was never issued", async () => {
    const hashed = await hashBackupCodes(generateBackupCodes(2));
    const result = await tryConsumeBackupCode(hashed, "not-a-real-code");
    expect(result).toBeNull();
  }, 10000);
});
