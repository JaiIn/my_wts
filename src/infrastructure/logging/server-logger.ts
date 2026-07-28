import "server-only";

import pino, {
  type DestinationStream,
  type LevelWithSilent,
  type Logger,
} from "pino";

import type { LogLevel, ServerEnvironment } from "../config/environment";
import { redactSensitiveData } from "./redaction";

export type LogContext = Readonly<{
  requestId?: string;
  operation?: string;
  routeTemplate?: string;
  method?: string;
  status?: number;
  durationMs?: number;
  upstreamRequestId?: string;
  errorCode?: string;
  rateLimitGroup?: string;
  context?: unknown;
}>;

export type StructuredLogger = Readonly<
  Record<LogLevel, (event: string, context?: LogContext) => void>
>;

type LoggerOptions = Readonly<{
  level: LogLevel;
  destination?: DestinationStream;
  knownSecrets?: readonly string[];
  clock?: () => Date;
}>;

function createPinoLogger(
  level: LevelWithSilent,
  destination?: DestinationStream,
): Logger {
  const options = {
    base: undefined,
    level,
    timestamp: false,
    formatters: {
      level(label: string) {
        return { level: label };
      },
    },
  };
  return destination ? pino(options, destination) : pino(options);
}

function createDefaultDestination(
  environment: ServerEnvironment,
): DestinationStream {
  const consoleDestination = pino.destination(1);
  const fileDestination = pino.transport({
    target: "pino-roll",
    options: {
      file: environment.logPath,
      size: "10m",
      mkdir: true,
      limit: {
        count: 4,
        removeOtherLogFiles: false,
      },
    },
  });
  return pino.multistream([
    { level: "info", stream: consoleDestination },
    { level: environment.logLevel, stream: fileDestination },
  ]);
}

export function createStructuredLogger(
  options: LoggerOptions,
): StructuredLogger {
  const output = createPinoLogger(options.level, options.destination);
  const knownSecrets = options.knownSecrets ?? [];
  const clock = options.clock ?? (() => new Date());

  function write(level: LogLevel, event: string, input: LogContext = {}) {
    try {
      const record = redactSensitiveData(
        {
          timestamp: clock().toISOString(),
          event,
          ...input,
        },
        knownSecrets,
      ) as Record<string, unknown>;
      output[level](record);
    } catch {
      // Logging must never interrupt the application request path.
    }
  }

  return Object.freeze({
    trace: (event, context) => write("trace", event, context),
    debug: (event, context) => write("debug", event, context),
    info: (event, context) => write("info", event, context),
    warn: (event, context) => write("warn", event, context),
    error: (event, context) => write("error", event, context),
  });
}

export function createServerLogger(
  environment: ServerEnvironment,
  destination?: DestinationStream,
): StructuredLogger {
  const knownSecrets =
    environment.toss.mode === "live"
      ? [environment.toss.clientId, environment.toss.clientSecret]
      : [];
  return createStructuredLogger({
    level: environment.logLevel,
    destination: destination ?? createDefaultDestination(environment),
    knownSecrets,
  });
}
