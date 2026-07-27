import { z } from "zod";

import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from "./auth-constants";

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_MAX_LENGTH = 40;

const USERNAME_PATTERN = /^[A-Za-z0-9._-]+$/;

const usernameSchema = z
  .string()
  .transform((username) => username.trim())
  .pipe(
    z
      .string()
      .min(USERNAME_MIN_LENGTH, "USERNAME_TOO_SHORT")
      .max(USERNAME_MAX_LENGTH, "USERNAME_TOO_LONG")
      .regex(USERNAME_PATTERN, "USERNAME_INVALID_CHARACTERS"),
  );

const displayNameSchema = z
  .string()
  .min(DISPLAY_NAME_MIN_LENGTH, "DISPLAY_NAME_TOO_SHORT")
  .max(DISPLAY_NAME_MAX_LENGTH, "DISPLAY_NAME_TOO_LONG");

const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "PASSWORD_TOO_SHORT")
  .max(PASSWORD_MAX_LENGTH, "PASSWORD_TOO_LONG");

export function normalizeUsername(username: string): string {
  return username.normalize("NFKC").toLowerCase();
}

export const signupInputSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    ["password"]: passwordSchema,
  })
  .strict()
  .transform((input) => {
    const { password } = input;
    return {
      username: input.username,
      displayName: input.displayName,
      password,
      usernameNormalized: normalizeUsername(input.username),
    };
  });

export const signupFormInputSchema = z
  .object({
    username: usernameSchema,
    displayName: displayNameSchema,
    ["password"]: passwordSchema,
    passwordConfirmation: passwordSchema,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.password !== input.passwordConfirmation) {
      context.addIssue({
        code: "custom",
        message: "PASSWORD_CONFIRMATION_MISMATCH",
        path: ["passwordConfirmation"],
      });
    }
  })
  .transform((input) => {
    const { password } = input;
    return {
      username: input.username,
      displayName: input.displayName,
      password,
      usernameNormalized: normalizeUsername(input.username),
    };
  });

export const loginInputSchema = z
  .object({
    username: usernameSchema,
    ["password"]: passwordSchema,
  })
  .strict()
  .transform((input) => {
    const { password } = input;
    return {
      username: input.username,
      password,
      usernameNormalized: normalizeUsername(input.username),
    };
  });

export type SignupInput = z.infer<typeof signupInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
