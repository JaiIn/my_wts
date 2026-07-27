import { createHash, randomBytes, randomUUID } from "node:crypto";

import { hashPassword } from "../../domain/auth/password";
import { signupInputSchema } from "../../domain/auth/validation";

const SESSION_ABSOLUTE_LIFETIME_MS = 7 * 24 * 60 * 60 * 1_000;

export type SignupPersistenceInput = {
  user: {
    id: string;
    username: string;
    usernameNormalized: string;
    displayName: string;
    passwordHash: string;
    createdAt: string;
    updatedAt: string;
  };
  session: {
    id: string;
    userId: string;
    tokenHash: string;
    selectedAccountRef: null;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
  };
};

export interface SignupPersistence {
  create(input: SignupPersistenceInput): void;
}

export class SignupValidationError extends Error {
  constructor(readonly fields: string[]) {
    super("VALIDATION_FAILED");
    this.name = "SignupValidationError";
  }
}

export class SignupPersistenceError extends Error {
  constructor() {
    super("DATABASE_ERROR");
    this.name = "SignupPersistenceError";
  }
}

export type SignupResult = {
  user: {
    id: string;
    username: string;
    displayName: string;
  };
  session: {
    token: string;
    expiresAt: Date;
  };
};

type SignupServiceOptions = {
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

export class SignupService {
  private readonly now: () => Date;
  private readonly createId: () => string;
  private readonly createToken: () => string;

  constructor(
    private readonly persistence: SignupPersistence,
    options: SignupServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.createId = options.createId ?? randomUUID;
    this.createToken = options.createToken ?? defaultSessionToken;
  }

  async signup(input: unknown): Promise<SignupResult> {
    const validation = signupInputSchema.safeParse(input);
    if (!validation.success) {
      throw new SignupValidationError(
        [
          ...new Set(
            validation.error.issues.map(
              (issue) => issue.path[0]?.toString() ?? "request",
            ),
          ),
        ].sort(),
      );
    }

    const createdAt = this.now();
    const expiresAt = new Date(
      createdAt.getTime() + SESSION_ABSOLUTE_LIFETIME_MS,
    );
    const userId = `usr_${this.createId()}`;
    const sessionToken = this.createToken();

    this.persistence.create({
      user: {
        id: userId,
        username: validation.data.username,
        usernameNormalized: validation.data.usernameNormalized,
        displayName: validation.data.displayName,
        passwordHash: await hashPassword(validation.data.password),
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      },
      session: {
        id: `ses_${this.createId()}`,
        userId,
        tokenHash: hashSessionToken(sessionToken),
        selectedAccountRef: null,
        createdAt: createdAt.toISOString(),
        lastSeenAt: createdAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      user: {
        id: userId,
        username: validation.data.username,
        displayName: validation.data.displayName,
      },
      session: {
        token: sessionToken,
        expiresAt,
      },
    };
  }
}
