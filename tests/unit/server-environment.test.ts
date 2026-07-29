import { describe, expect, it } from "vitest";

import {
  parseServerEnvironment,
  projectPublicServerEnvironment,
  ServerEnvironmentError,
} from "../../src/infrastructure/config/environment";
import { loadServerEnvironment } from "../../src/infrastructure/config/server-environment";

const FIXTURE_CLIENT_ID = ["fixture", "client"].join("-");
const FIXTURE_CLIENT_SECRET = ["fixture", "secret"].join("-");

describe("server environment", () => {
  it("uses frozen defaults and permits empty credentials while live is false", () => {
    const source: Record<string, string | undefined> = {
      ALLOW_LIVE_TOSS_API: " false ",
      ["TOSS_CLIENT_ID"]: "",
      ["TOSS_CLIENT_SECRET"]: "",
      UNRELATED_HOST_VARIABLE: "preserved-by-host",
    };
    const environment = parseServerEnvironment(source);

    expect(environment).toEqual({
      tossApiBaseUrl: "https://openapi.tossinvest.com",
      toss: { mode: "disabled" },
      localBindHost: "127.0.0.1",
      localPort: 3000,
      databasePath: "./data/my_wts.sqlite3",
      logLevel: "info",
      logPath: "./logs/my_wts.log",
      requestTimeoutGetMs: 8000,
    });
    expect(Object.isFrozen(environment)).toBe(true);
    expect(Object.isFrozen(environment.toss)).toBe(true);
  });

  it("loads an injected environment without touching the host process", () => {
    expect(
      loadServerEnvironment({
        ALLOW_LIVE_TOSS_API: "false",
        LOCAL_PORT: "3200",
      }).localPort,
    ).toBe(3200);
  });

  it("does not read credentials while the live gate is disabled", () => {
    const source = { ALLOW_LIVE_TOSS_API: "false" } as Record<
      string,
      string | undefined
    >;
    Object.defineProperties(source, {
      ["TOSS_CLIENT_ID"]: {
        get() {
          throw new Error("credential must not be read");
        },
      },
      ["TOSS_CLIENT_SECRET"]: {
        get() {
          throw new Error("credential must not be read");
        },
      },
    });

    expect(parseServerEnvironment(source).toss).toEqual({ mode: "disabled" });
  });

  it("requires both well-formed credentials only when live is true", () => {
    expect(() =>
      parseServerEnvironment({ ALLOW_LIVE_TOSS_API: "true" }),
    ).toThrowError(
      expect.objectContaining({
        variableName: "TOSS_CLIENT_ID",
        code: "INVALID_SERVER_ENVIRONMENT",
      }),
    );
    expect(() =>
      parseServerEnvironment({
        ALLOW_LIVE_TOSS_API: "true",
        ["TOSS_CLIENT_ID"]: FIXTURE_CLIENT_ID,
      }),
    ).toThrowError(
      expect.objectContaining({ variableName: "TOSS_CLIENT_SECRET" }),
    );
    expect(() =>
      parseServerEnvironment({
        ALLOW_LIVE_TOSS_API: "true",
        ["TOSS_CLIENT_ID"]: "invalid credential",
        ["TOSS_CLIENT_SECRET"]: FIXTURE_CLIENT_SECRET,
      }),
    ).toThrowError(expect.objectContaining({ variableName: "TOSS_CLIENT_ID" }));

    expect(
      parseServerEnvironment({
        ALLOW_LIVE_TOSS_API: " TRUE ",
        ["TOSS_CLIENT_ID"]: FIXTURE_CLIENT_ID,
        ["TOSS_CLIENT_SECRET"]: FIXTURE_CLIENT_SECRET,
      }).toss,
    ).toEqual({
      mode: "live",
      clientId: FIXTURE_CLIENT_ID,
      clientSecret: FIXTURE_CLIENT_SECRET,
    });
  });

  it("parses booleans, integers, fixed host, URL, and log level explicitly", () => {
    const environment = parseServerEnvironment({
      ALLOW_LIVE_TOSS_API: "false",
      TOSS_API_BASE_URL: " https://openapi.tossinvest.com ",
      LOCAL_BIND_HOST: "127.0.0.1",
      LOCAL_PORT: "3100",
      DATABASE_PATH: " ./data/fixture.sqlite3 ",
      LOG_LEVEL: "WARN",
      LOG_PATH: " ./logs/fixture.log ",
      REQUEST_TIMEOUT_GET_MS: "9000",
    });

    expect(environment).toMatchObject({
      localPort: 3100,
      databasePath: "./data/fixture.sqlite3",
      logLevel: "warn",
      logPath: "./logs/fixture.log",
      requestTimeoutGetMs: 9000,
    });

    for (const source of [
      { ALLOW_LIVE_TOSS_API: "1" },
      { LOCAL_BIND_HOST: "0.0.0.0" },
      { LOCAL_PORT: "0" },
      { LOCAL_PORT: "3.5" },
      { REQUEST_TIMEOUT_GET_MS: "NaN" },
      { LOG_LEVEL: "verbose" },
      { TOSS_API_BASE_URL: "https://example.invalid" },
    ]) {
      expect(() => parseServerEnvironment(source)).toThrow(
        ServerEnvironmentError,
      );
    }
  });

  it("distinguishes undefined defaults from explicitly blank values", () => {
    expect(parseServerEnvironment({}).logLevel).toBe("info");
    for (const source of [
      { ALLOW_LIVE_TOSS_API: " " },
      { LOCAL_PORT: "" },
      { DATABASE_PATH: " " },
      { LOG_PATH: "" },
    ]) {
      expect(() => parseServerEnvironment(source)).toThrow(
        ServerEnvironmentError,
      );
    }
  });

  it("never includes the invalid environment value in an error", () => {
    const marker = "fixture-sensitive-marker";
    let error: unknown;
    try {
      parseServerEnvironment({
        TOSS_API_BASE_URL: `https://${marker}.invalid`,
      });
    } catch (caught) {
      error = caught;
    }
    expect(String(error)).toContain("TOSS_API_BASE_URL");
    expect(String(error)).not.toContain(marker);
  });

  it("projects an immutable public allowlist without credentials", () => {
    const environment = parseServerEnvironment({
      ALLOW_LIVE_TOSS_API: "true",
      ["TOSS_CLIENT_ID"]: FIXTURE_CLIENT_ID,
      ["TOSS_CLIENT_SECRET"]: FIXTURE_CLIENT_SECRET,
    });
    const projection = projectPublicServerEnvironment(environment);

    expect(projection).toEqual({
      tossApiBaseUrl: "https://openapi.tossinvest.com",
      allowLiveTossApi: true,
    });
    expect(Object.isFrozen(projection)).toBe(true);
    expect(JSON.stringify(projection)).not.toMatch(
      /client|secret|token|account/i,
    );
  });
});
