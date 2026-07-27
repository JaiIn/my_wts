import { resolve } from "node:path";
import { spawn } from "node:child_process";

const runtimeDirectory = process.env.MY_WTS_E2E_RUNTIME_DIR;
if (!runtimeDirectory) {
  throw new Error("MY_WTS_E2E_RUNTIME_DIR is required.");
}

const nextCli = resolve(
  import.meta.dirname,
  "../node_modules/next/dist/bin/next",
);
const server = spawn(
  process.execPath,
  [nextCli, "dev", "--hostname", "127.0.0.1", "--port", "3000"],
  {
    cwd: runtimeDirectory,
    env: process.env,
    stdio: "inherit",
  },
);

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!server.killed) {
      server.kill(signal);
    }
  });
}
