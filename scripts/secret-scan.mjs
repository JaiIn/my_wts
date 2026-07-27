import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const SECRET_PATTERNS = [
  {
    name: "non-empty TOSS_CLIENT_SECRET",
    pattern: /^[ \t]*TOSS_CLIENT_SECRET[ \t]*=[ \t]*(?![<{$[]|$)[^\r\n#]+/gim,
  },
  {
    name: "non-placeholder bearer token",
    pattern:
      /Authorization[ \t]*:[ \t]*Bearer[ \t]+(?![<{$[])[A-Za-z0-9._~+/=-]{16,}/gim,
  },
  {
    name: "non-placeholder sensitive assignment",
    pattern:
      /(?:access_token|client_secret|password|my_wts_session)[ \t]*[=:][ \t]*["']?(?![<{$[]|$)[A-Za-z0-9._~+/=-]{8,}/gim,
  },
];

function gitTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], {
    encoding: null,
  });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0 || !result.stdout) {
    throw new Error("Unable to list tracked files for secret scanning.");
  }

  return result.stdout.toString("utf8").split("\0").filter(Boolean);
}

export function scanPaths(paths) {
  const findings = [];

  for (const filePath of paths) {
    if (!existsSync(filePath)) {
      continue;
    }

    const buffer = readFileSync(filePath);
    if (buffer.includes(0)) {
      continue;
    }

    const content = buffer.toString("utf8");
    for (const { name, pattern } of SECRET_PATTERNS) {
      pattern.lastIndex = 0;
      if (pattern.test(content)) {
        findings.push({ filePath, pattern: name });
      }
    }
  }

  return findings;
}

function main() {
  const findings = scanPaths(gitTrackedFiles());

  if (findings.length > 0) {
    for (const finding of findings) {
      console.error(`${finding.filePath}: ${finding.pattern}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Secret scan passed.");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main();
}
