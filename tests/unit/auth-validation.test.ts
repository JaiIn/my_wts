import { describe, expect, it } from "vitest";

import {
  DISPLAY_NAME_MAX_LENGTH,
  loginInputSchema,
  normalizeUsername,
  signupFormInputSchema,
  signupInputSchema,
  USERNAME_MAX_LENGTH,
} from "../../src/domain/auth/validation";
import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from "../../src/domain/auth/password";

describe("auth input validation", () => {
  it("trims and normalizes a valid ASCII username", () => {
    const result = signupInputSchema.parse({
      username: "  Local.User_-  ",
      displayName: "로컬 사용자",
      password: "a".repeat(PASSWORD_MIN_LENGTH),
    });

    expect(result.username).toBe("Local.User_-");
    expect(result.usernameNormalized).toBe("local.user_-");
    expect(normalizeUsername("ＦＯＯ")).toBe("foo");
  });

  it("accepts the exact username, display-name, and password boundaries", () => {
    expect(
      signupInputSchema.safeParse({
        username: "abc",
        displayName: "x",
        password: "a".repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      signupInputSchema.safeParse({
        username: "a".repeat(USERNAME_MAX_LENGTH),
        displayName: "가".repeat(DISPLAY_NAME_MAX_LENGTH),
        password: "a".repeat(PASSWORD_MAX_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("rejects username length and non-ASCII characters", () => {
    for (const username of [
      "ab",
      "a".repeat(USERNAME_MAX_LENGTH + 1),
      "local user",
      "사용자",
      "ｌｏｃａｌ",
      "local/user",
    ]) {
      expect(
        signupInputSchema.safeParse({
          username,
          displayName: "Valid",
          password: "a".repeat(PASSWORD_MIN_LENGTH),
        }).success,
      ).toBe(false);
    }
  });

  it("rejects invalid display-name and password lengths without complexity rules", () => {
    expect(
      signupInputSchema.safeParse({
        username: "valid.user",
        displayName: "",
        password: "a".repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(false);
    expect(
      signupInputSchema.safeParse({
        username: "valid.user",
        displayName: "x".repeat(DISPLAY_NAME_MAX_LENGTH + 1),
        password: "a".repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(false);
    expect(
      signupInputSchema.safeParse({
        username: "valid.user",
        displayName: "Valid",
        password: "a".repeat(PASSWORD_MIN_LENGTH - 1),
      }).success,
    ).toBe(false);
    expect(
      signupInputSchema.safeParse({
        username: "valid.user",
        displayName: "Valid",
        password: "a".repeat(PASSWORD_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
    expect(
      signupInputSchema.safeParse({
        username: "valid.user",
        displayName: "Valid",
        password: "a".repeat(PASSWORD_MIN_LENGTH),
      }).success,
    ).toBe(true);
  });

  it("validates password confirmation for signup forms", () => {
    const password = "a".repeat(PASSWORD_MIN_LENGTH);
    const mismatch = signupFormInputSchema.safeParse({
      username: "valid.user",
      displayName: "Valid",
      password,
      passwordConfirmation: "b".repeat(PASSWORD_MIN_LENGTH),
    });

    expect(mismatch.success).toBe(false);
    if (!mismatch.success) {
      expect(mismatch.error.issues).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            message: "PASSWORD_CONFIRMATION_MISMATCH",
            path: ["passwordConfirmation"],
          }),
        ]),
      );
    }
  });

  it("rejects wrong input types and unknown fields", () => {
    for (const input of [
      null,
      {},
      { username: 123, password: "a".repeat(PASSWORD_MIN_LENGTH) },
      { username: "valid.user", password: false },
      {
        username: "valid.user",
        password: "a".repeat(PASSWORD_MIN_LENGTH),
        revealsUserExistence: true,
      },
    ]) {
      expect(loginInputSchema.safeParse(input).success).toBe(false);
    }
  });

  it("normalizes login input without encoding user existence", () => {
    const result = loginInputSchema.parse({
      username: "  LOCAL.User  ",
      password: "a".repeat(PASSWORD_MIN_LENGTH),
    });

    expect(result).toEqual({
      username: "LOCAL.User",
      usernameNormalized: "local.user",
      password: "a".repeat(PASSWORD_MIN_LENGTH),
    });
  });
});
