const LOGIN_FAILURE_LIMIT = 5;
const LOGIN_FAILURE_WINDOW_MS = 15 * 60 * 1_000;

type FailureBucket = {
  count: number;
  resetsAt: number;
};

export class LoginRateLimitedError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("AUTH_RATE_LIMITED");
    this.name = "LoginRateLimitedError";
  }
}

export interface LoginAttemptState {
  assertAllowed(): void;
  recordFailure(): void;
  clear(): void;
}

export interface LoginAttemptLimiter {
  run<T>(
    usernameNormalized: string,
    operation: (state: LoginAttemptState) => Promise<T>,
  ): Promise<T>;
}

type LoginAttemptLimiterOptions = {
  now?: () => Date;
};

export class MemoryLoginAttemptLimiter implements LoginAttemptLimiter {
  private readonly buckets = new Map<string, FailureBucket>();
  private readonly queues = new Map<string, Promise<void>>();
  private readonly now: () => Date;

  constructor(options: LoginAttemptLimiterOptions = {}) {
    this.now = options.now ?? (() => new Date());
  }

  async run<T>(
    usernameNormalized: string,
    operation: (state: LoginAttemptState) => Promise<T>,
  ): Promise<T> {
    const previous = this.queues.get(usernameNormalized) ?? Promise.resolve();
    const execution = previous
      .catch(() => undefined)
      .then(() => operation(this.createState(usernameNormalized)));
    const tail = execution.then(
      () => undefined,
      () => undefined,
    );
    this.queues.set(usernameNormalized, tail);

    try {
      return await execution;
    } finally {
      if (this.queues.get(usernameNormalized) === tail) {
        this.queues.delete(usernameNormalized);
      }
    }
  }

  private createState(usernameNormalized: string): LoginAttemptState {
    return {
      assertAllowed: () => {
        const now = this.now().getTime();
        const bucket = this.activeBucket(usernameNormalized, now);
        if (bucket && bucket.count >= LOGIN_FAILURE_LIMIT) {
          throw new LoginRateLimitedError(
            Math.max(1, Math.ceil((bucket.resetsAt - now) / 1_000)),
          );
        }
      },
      recordFailure: () => {
        const now = this.now().getTime();
        const bucket = this.activeBucket(usernameNormalized, now);
        if (bucket) {
          bucket.count += 1;
          return;
        }
        this.buckets.set(usernameNormalized, {
          count: 1,
          resetsAt: now + LOGIN_FAILURE_WINDOW_MS,
        });
      },
      clear: () => {
        this.buckets.delete(usernameNormalized);
      },
    };
  }

  private activeBucket(
    usernameNormalized: string,
    now: number,
  ): FailureBucket | undefined {
    const bucket = this.buckets.get(usernameNormalized);
    if (bucket && now >= bucket.resetsAt) {
      this.buckets.delete(usernameNormalized);
      return undefined;
    }
    return bucket;
  }
}
