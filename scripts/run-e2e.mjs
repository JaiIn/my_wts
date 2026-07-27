import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const projectRoot = resolve(import.meta.dirname, "..");
const runtimeParent = resolve(projectRoot, "test-results");
mkdirSync(runtimeParent, { recursive: true });
const runtimeDirectory = mkdtempSync(join(runtimeParent, "e2e-runtime-"));
const databaseDirectory = mkdtempSync(join(tmpdir(), "my-wts-e2e-db-"));
const databasePath = join(databaseDirectory, "my_wts.sqlite3");

const runtimeEntries = [
  "app",
  "drizzle",
  "public",
  "src",
  "next.config.ts",
  "package.json",
  "postcss.config.mjs",
  "proxy.ts",
  "tsconfig.json",
];

function copyRuntimeEntry(entry) {
  cpSync(join(projectRoot, entry), join(runtimeDirectory, basename(entry)), {
    recursive: true,
  });
}

let exitCode = 1;
try {
  for (const entry of runtimeEntries) {
    copyRuntimeEntry(entry);
  }

  const result = spawnSync(
    process.execPath,
    [resolve(projectRoot, "node_modules/@playwright/test/cli.js"), "test"],
    {
      cwd: projectRoot,
      env: {
        ...process.env,
        ALLOW_LIVE_TOSS_API: "false",
        DATABASE_PATH: databasePath,
        MY_WTS_E2E_RUNTIME_DIR: runtimeDirectory,
        TOSS_CLIENT_ID: "",
        TOSS_CLIENT_SECRET: "",
      },
      stdio: "inherit",
    },
  );

  if (result.error) {
    throw result.error;
  }
  exitCode = result.status ?? 1;
} finally {
  rmSync(runtimeDirectory, { force: true, recursive: true });
  rmSync(databaseDirectory, { force: true, recursive: true });
}

process.exit(exitCode);
