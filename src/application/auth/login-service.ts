import { createHash, randomBytes, randomUUID } from "node:crypto";

import { verifyPassword } from "../../domain/auth/password";
import { loginInputSchema } from "../../domain/auth/validation";

const SESSION_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;
const DUMMY_PASSWORD_HASH = [
  "scrypt$v1$N=32768,r=8,p=1",
  Buffer.alloc(16).toString("base64url"),
  Buffer.alloc(64).toString("base64url"),
].join("$");

export type LoginUser = {
  id: string;
  passwordHash: string;
};

export type LoginSessionInput = {
  id: string;
  userId: string;
  tokenHash: string;
  selectedAccountRef: null;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
};

export interface LoginPersistence {
  findUserByNormalizedUsername(
    usernameNormalized: string,
  ): LoginUser | undefined;
  createSession(session: LoginSessionInput): void;
}

export class LoginValidationError extends Error {
  constructor(readonly fields: string[]) {
    super("VALIDATION_FAILED");
    this.name = "LoginValidationError";
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super("INVALID_CREDENTIALS");
    this.name = "InvalidCredentialsError";
  }
}

export class LoginPersistenceError extends Error {
  constructor() {
    super("DATABASE_ERROR");
    this.name = "LoginPersistenceError";
  }
}

export type LoginResult = {
  session: {
    token: string;
    expiresAt: Date;
  };
};

type LoginServiceOptions = {
  now?: () => Date;
  createId?: () => string;
  createToken?: () => string;
};

function defaultSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export class LoginService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createToken: () => string;

  constructor(
    private readonly persistence: LoginPersistence,
    options: LoginServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.createToken = options.createToken ?? defaultSessionToken;
  }

  async login(input: unknown): Promise<LoginResult> {
    const validation = loginInputSchema.safeParse(input);
    if (!validation.success) {
      throw new LoginValidationError(
        [
          ...new Set(
            validation.error.issues.map(
              (issue) => issue.path[0]?.toString() ?? "request",
            ),
          ),
        ].sort(),
      );
    }

    const user = this.persistence.findUserByNormalizedUsername(
      validation.data.usernameNormalized,
    );
    const credentialIsValid = await verifyPassword(
      validation.data.password,
      user?.passwordHash ?? DUMMY_PASSWORD_HASH,
    );

    if (!user || !credentialIsValid) {
      throw new InvalidCredentialsError();
    }

    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + SESSION_ABSOLUTE_LIFETIME_MS,
    );
    const sessionToken = this.createToken();

    this.persistence.createSession({
      id: `ses_${this.createId()}`,
      userId: user.id,
      tokenHash: hashSessionToken(sessionToken),
      selectedAccountRef: null,
      createdAt: createdAt.toISOString(),
      lastSeenAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    return {
      session: {
        token: sessionToken,
        expiresAt,
      },
    };
  }
}
