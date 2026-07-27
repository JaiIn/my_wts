import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

const packageJson = JSON.parse(readFileSync("package.json", "utf8")) as {
  scripts: Record<string, string>;
};

describe("project foundation", () => {
  it("binds local execution scripts to the loopback interface", () => {
    expect(packageJson.scripts.dev).toBe(
      "next dev --hostname 127.0.0.1 --port 3000",
    );
    expect(packageJson.scripts.start).toBe(
      "next start --hostname 127.0.0.1 --port 3000",
    );
  });

  it("keeps the stage check and test commands available", () => {
    expect(packageJson.scripts.typecheck).toBe("tsc --noEmit");
    expect(packageJson.scripts.test).toBe("vitest run tests/unit");
    expect(packageJson.scripts["check:stage"]).toBe(
      "node scripts/check-stage.mjs",
    );
    expect(packageJson.scripts["spec:check"]).toBe(
      "redocly lint specs/my-wts-bff-openapi.yaml",
    );
  });
});
