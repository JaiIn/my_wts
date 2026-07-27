import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: [
      "tests/unit/**/*.test.ts",
      "tests/contract/**/*.test.ts",
      "tests/component/**/*.test.tsx",
      "tests/integration/**/*.test.ts",
      "tests/safety/**/*.test.ts",
    ],
    passWithNoTests: true,
    testTimeout: 5_000,
  },
});
