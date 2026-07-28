import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const projectRoot = resolve(import.meta.dirname, "../..");

describe("server-only boundary", () => {
  it("poisons client imports for the environment loader and logger", () => {
    for (const path of [
      "src/infrastructure/config/server-environment.ts",
      "src/infrastructure/logging/server-logger.ts",
    ]) {
      expect(readFileSync(resolve(projectRoot, path), "utf8")).toMatch(
        /^import "server-only";/m,
      );
    }

    const require = createRequire(import.meta.url);
    expect(() => require("server-only")).toThrow(
      /cannot be imported from a Client Component/i,
    );
  });

  it("does not expose server configuration through public prefixes or client modules", () => {
    const environmentSource = readFileSync(
      resolve(projectRoot, "src/infrastructure/config/environment.ts"),
      "utf8",
    );
    expect(environmentSource).not.toMatch(/NEXT_PUBLIC_|VITE_/);

    const clientSources = [
      "src/ui/auth/login-form.tsx",
      "src/ui/auth/signup-form.tsx",
      "src/ui/market/market-screen.tsx",
      "src/ui/market/candle-chart.tsx",
    ].map((path) => readFileSync(resolve(projectRoot, path), "utf8"));
    expect(clientSources.join("\n")).not.toMatch(
      /server-environment|server-logger|TOSS_CLIENT|process\.env/,
    );
  });
});
