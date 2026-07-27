import { hashCanonicalSessionToken } from "../../domain/auth/session-token";

export interface LogoutPersistence {
  deleteSessionByTokenHash(tokenHash: string): boolean;
}

export class LogoutAuthenticationError extends Error {
  constructor() {
    super("AUTH_REQUIRED");
    this.name = "LogoutAuthenticationError";
  }
}

export class LogoutPersistenceError extends Error {
  constructor() {
    super("DATABASE_ERROR");
    this.name = "LogoutPersistenceError";
  }
}

export class LogoutService {
  constructor(private readonly persistence: LogoutPersistence) {}

  logout(token: unknown): void {
    const tokenHash = hashCanonicalSessionToken(token);
    if (!tokenHash) {
      throw new LogoutAuthenticationError();
    }

    if (!this.persistence.deleteSessionByTokenHash(tokenHash)) {
      throw new LogoutAuthenticationError();
    }
  }
}
