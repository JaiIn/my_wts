import { describe, expect, it } from "vitest";

import {
  hashPassword,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
  verifyPassword,
} from "../../src/domain/auth/password";

const TEST_INPUT_VALUE = "unit-test-value";

function replaceFirstCharacter(value: string): string {
  return `${value.startsWith("A") ? "B" : "A"}${value.slice(1)}`;
}

describe("password hashing", () => {
  it("uses the frozen scrypt format with a fresh salt", async () => {
    const firstHash = await hashPassword(TEST_INPUT_VALUE);
    const secondHash = await hashPassword(TEST_INPUT_VALUE);

    expect(firstHash).toMatch(
      /^scrypt\$v1\$N=32768,r=8,p=1\$[A-Za-z0-9_-]{22}\$[A-Za-z0-9_-]{86}$/,
    );
    expect(secondHash).not.toBe(firstHash);
    expect(firstHash).not.toContain(TEST_INPUT_VALUE);
  });

  it("accepts the correct password and rejects a different password", async () => {
    const encodedHash = await hashPassword(TEST_INPUT_VALUE);

    await expect(verifyPassword(TEST_INPUT_VALUE, encodedHash)).resolves.toBe(
      true,
    );
    await expect(
      verifyPassword("different-test-value", encodedHash),
    ).resolves.toBe(false);
  });

  it("rejects salt, derived-key, and format tampering safely", async () => {
    const encodedHash = await hashPassword(TEST_INPUT_VALUE);
    const segments = encodedHash.split("$");
    const saltTampered = [
      ...segments.slice(0, 3),
      replaceFirstCharacter(segments[3]),
      segments[4],
    ].join("$");
    const keyTampered = [
      ...segments.slice(0, 4),
      replaceFirstCharacter(segments[4]),
    ].join("$");

    await expect(verifyPassword(TEST_INPUT_VALUE, saltTampered)).resolves.toBe(
      false,
    );
    await expect(verifyPassword(TEST_INPUT_VALUE, keyTampered)).resolves.toBe(
      false,
    );
    await expect(
      verifyPassword(TEST_INPUT_VALUE, "invalid-password-hash"),
    ).resolves.toBe(false);
    await expect(
      verifyPassword(TEST_INPUT_VALUE, "scrypt$v1$N=1,r=1,p=1$invalid$invalid"),
    ).resolves.toBe(false);
  });

  it("enforces password resource bounds before hashing", async () => {
    await expect(
      hashPassword("a".repeat(PASSWORD_MIN_LENGTH - 1)),
    ).rejects.toBeInstanceOf(RangeError);
    await expect(
      hashPassword("a".repeat(PASSWORD_MAX_LENGTH + 1)),
    ).rejects.toBeInstanceOf(RangeError);
  });
});
