import { spawnSync } from "node:child_process";

import { scanPaths } from "./secret-scan.mjs";

const FROZEN_ROOT_FILES = new Set(["CODEX.md", "README.md"]);
const FROZEN_DIRECTORIES = ["docs/", "references/", "specs/", "templates/"];

function run(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: "inherit",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function capture(command, args) {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")} failed.`);
  }

  return result.stdout;
}

function normalizePath(filePath) {
  return filePath.replaceAll("\\", "/").replace(/^"|"$/g, "");
}

function changedPaths() {
  const status = capture("git", [
    "status",
    "--porcelain=v1",
    "--untracked-files=all",
  ]);
  const paths = new Set();

  for (const line of status.split(/\r?\n/).filter(Boolean)) {
    const statusPath = line.slice(3).trim();
    for (const candidate of statusPath.split(" -> ")) {
      paths.add(normalizePath(candidate));
    }
  }

  return [...paths];
}

function isFrozenPath(filePath) {
  return (
    FROZEN_ROOT_FILES.has(filePath) ||
    FROZEN_DIRECTORIES.some((directory) => filePath.startsWith(directory))
  );
}

function main() {
  const paths = changedPaths();
  const frozenChanges = paths.filter(isFrozenPath);

  if (frozenChanges.length > 0) {
    console.error("Frozen documentation changes are not allowed:");
    for (const filePath of frozenChanges) {
      console.error(`- ${filePath}`);
    }
    process.exit(1);
  }

  const lintPaths = paths.filter((filePath) =>
    /\.[cm]?[jt]sx?$/.test(filePath),
  );
  if (lintPaths.length > 0) {
    run(process.execPath, ["node_modules/eslint/bin/eslint.js", ...lintPaths]);
  }

  run(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit"]);

  if (lintPaths.length > 0) {
    run(process.execPath, [
      "node_modules/vitest/vitest.mjs",
      "related",
      "--run",
      "--passWithNoTests",
      ...lintPaths,
    ]);
  }

  run("git", ["diff", "--check"]);
  run("git", ["diff", "--cached", "--check"]);

  const findings = scanPaths(paths);
  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.filePath}: ${finding.pattern}`);
    }
    process.exit(1);
  }

  console.log(`Stage check passed for ${paths.length} changed file(s).`);
}

main();
