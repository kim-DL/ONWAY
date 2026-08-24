import { describe, expect, it } from "vitest";

import {
  createPinLookupKey,
  generateRandomPin,
  hashPin,
  isForbiddenPin,
  verifyPin,
} from "../src/auth/pin-crypto.js";
import {
  INITIAL_LOOKUP_LOCK_MS,
  MAX_LOOKUP_LOCK_MS,
  lookupLockDuration,
} from "../src/auth/policy.js";

const lookupSecret = "unit-test-lookup-secret-at-least-thirty-two-characters";
const secondLookupSecret = "second-unit-test-secret-at-least-thirty-two-characters";
const pepper = "unit-test-pin-pepper-at-least-thirty-two-characters";

describe("PIN cryptography", () => {
  it("keeps leading zeroes and verifies a separately salted scrypt hash", async () => {
    const encoded = await hashPin("012804", pepper, {
      salt: Buffer.from("0123456789abcdef"),
    });

    expect(encoded).toMatch(/^scrypt\$v1\$/);
    await expect(verifyPin("012804", encoded, pepper)).resolves.toBe(true);
    await expect(verifyPin("128040", encoded, pepper)).resolves.toBe(false);
    expect(encoded).not.toContain("012804");
  });

  it("uses a deterministic but secret-specific HMAC lookup key", () => {
    const first = createPinLookupKey("482915", lookupSecret);

    expect(first).toBe(createPinLookupKey("482915", lookupSecret));
    expect(first).not.toBe(createPinLookupKey("482915", secondLookupSecret));
    expect(first).not.toContain("482915");
  });

  it("rejects obvious assignment PINs and generates a valid alternative", () => {
    expect(isForbiddenPin("111111")).toBe(true);
    expect(isForbiddenPin("123456")).toBe(true);
    expect(isForbiddenPin("654321")).toBe(true);

    const generated = generateRandomPin();
    expect(generated).toMatch(/^\d{6}$/);
    expect(isForbiddenPin(generated)).toBe(false);
  });
});

describe("lock policy", () => {
  it("starts at 15 minutes, grows progressively, and is capped", () => {
    expect(lookupLockDuration(1)).toBe(INITIAL_LOOKUP_LOCK_MS);
    expect(lookupLockDuration(2)).toBe(INITIAL_LOOKUP_LOCK_MS * 2);
    expect(lookupLockDuration(99)).toBe(MAX_LOOKUP_LOCK_MS);
  });
});
