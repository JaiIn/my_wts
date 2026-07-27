import { beforeEach, describe, expect, it } from "vitest";

import {
  InvalidCredentialsError,
  type LoginPersistence,
  type LoginSessionInput,
  LoginService,
  LoginValidationError,
} from "../../src/application/auth/login-service";
import { LoginRateLimitedError } from "../../src/application/auth/login-attempt-limiter";
import { hashPassword } from "../../src/domain/auth/password";

const NOW = new Date("2026-07-27T00:00:00.000Z");

describe("LoginService", () => {
  let credentialHash: string;
  let createdSession: LoginSessionInput | undefined;
  let lookedUpUsername: string | undefined;
  let persistence: LoginPersistence;

  beforeEach(async () => {
    credentialHash = await hashPassword("x".repeat(10));
    createdSession = undefined;
    lookedUpUsername = undefined;
    persistence = {
      findUserByNormalizedUsername(usernameNormalized) {
        lookedUpUsername = usernameNormalized;
        return usernameNormalized === "local.user"
          ? { id: "usr_test", passwordHash: credentialHash }
          : undefined;
      },
      createSession(session) {
        createdSession = session;
      },
    };
  });

  it("normalizes the username and creates a seven-day hashed session", async () => {
    const service = new LoginService(persistence, {
      now: () => NOW,
      createId: () => "login-id",
      createToken: () => "unit-session-value",
    });

    const result = await service.login({
      username: "  LOCAL.User  ",
      password: "x".repeat(10),
    });

    expect(lookedUpUsername).toBe("local.user");
    expect(result.session).toEqual({
      token: "unit-session-value",
      expiresAt: new Date("2026-08-03T00:00:00.000Z"),
    });
    expect(createdSession).toEqual({
      id: "ses_login-id",
      userId: "usr_test",
      tokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      selectedAccountRef: null,
      createdAt: NOW.toISOString(),
      lastSeenAt: NOW.toISOString(),
      expiresAt: "2026-08-03T00:00:00.000Z",
    });
    expect(createdSession?.tokenHash).not.toBe("unit-session-value");
  });

  it("uses the same failure for missing users and incorrect credentials", async () => {
    const service = new LoginService(persistence);

    await expect(
      service.login({
        username: "missing.user",
        password: "x".repeat(10),
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      service.login({
        username: "local.user",
        password: "y".repeat(10),
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    expect(createdSession).toBeUndefined();
  });

  it("rejects wrong types and unknown fields before persistence", async () => {
    const service = new LoginService(persistence);

    await expect(
      service.login({
        username: 123,
        password: "x".repeat(10),
      }),
    ).rejects.toBeInstanceOf(LoginValidationError);
    await expect(
      service.login({
        username: "local.user",
        password: "x".repeat(10),
        unknown: true,
      }),
    ).rejects.toBeInstanceOf(LoginValidationError);
    expect(lookedUpUsername).toBeUndefined();
  });

  it("clears prior failures only after a successful login", async () => {
    const service = new LoginService(persistence);

    await expect(
      service.login({
        username: "local.user",
        password: "y".repeat(10),
      }),
    ).rejects.toBeInstanceOf(InvalidCredentialsError);
    await expect(
      service.login({
        username: "local.user",
        password: "x".repeat(10),
      }),
    ).resolves.toBeDefined();

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await expect(
        service.login({
          username: "local.user",
          password: "y".repeat(10),
        }),
      ).rejects.toBeInstanceOf(InvalidCredentialsError);
    }
    await expect(
      service.login({
        username: "local.user",
        password: "x".repeat(10),
      }),
    ).rejects.toBeInstanceOf(LoginRateLimitedError);
  });
});
