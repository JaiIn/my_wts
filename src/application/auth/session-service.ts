import { hashCanonicalSessionToken } from "../../domain/auth/session-token";

const SESSION_IDLE_LIFETIME_MS = 12 * 60 * 60 * 1_000;
const SESSION_LAST_SEEN_UPDATE_INTERVAL_MS = 15 * 60 * 1_000;

export type SessionRecordForAuthentication = {
  userId: string;
  lastSeenAt: string;
  expiresAt: string;
};

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
};

export interface SessionPersistence {
  findSessionByTokenHash(
    tokenHash: string,
  ): SessionRecordForAuthentication | undefined;
  findUserById(userId: string): SessionUser | undefined;
  updateLastSeenAt(tokenHash: string, lastSeenAt: string): void;
}

export type SessionAuthenticationFailureCode =
  "AUTH_REQUIRED" | "SESSION_EXPIRED";

export class SessionAuthenticationError extends Error {
  constructor(readonly code: SessionAuthenticationFailureCode) {
    super(code);
    this.name = "SessionAuthenticationError";
  }
}

export class SessionPersistenceError extends Error {
  constructor() {
    super("DATABASE_ERROR");
    this.name = "SessionPersistenceError";
  }
}

type SessionServiceOptions = {
  now?: () => Date;
};

function parseStoredDate(value: string): number | undefined {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

export class SessionService {
  private readonly now: () => Date;

  constructor(
    private readonly persistence: SessionPersistence,
    options: SessionServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
  }

  authenticate(token: unknown): SessionUser {
    const tokenHash = hashCanonicalSessionToken(token);
    if (!tokenHash) {
      throw new SessionAuthenticationError("AUTH_REQUIRED");
    }

    const session = this.persistence.findSessionByTokenHash(tokenHash);
    if (!session) {
      throw new SessionAuthenticationError("AUTH_REQUIRED");
    }

    const now = this.now().getTime();
    const absoluteExpiry = parseStoredDate(session.expiresAt);
    const lastSeenAt = parseStoredDate(session.lastSeenAt);
    if (
      absoluteExpiry === undefined ||
      lastSeenAt === undefined ||
      now >= absoluteExpiry ||
      now - lastSeenAt >= SESSION_IDLE_LIFETIME_MS
    ) {
      throw new SessionAuthenticationError("SESSION_EXPIRED");
    }

    const user = this.persistence.findUserById(session.userId);
    if (!user) {
      throw new SessionAuthenticationError("AUTH_REQUIRED");
    }

    if (now - lastSeenAt >= SESSION_LAST_SEEN_UPDATE_INTERVAL_MS) {
      this.persistence.updateLastSeenAt(tokenHash, new Date(now).toISOString());
    }

    return user;
  }
}
