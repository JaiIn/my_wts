import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, relative, resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

import { parseServerEnvironment } from "../../src/infrastructure/config/environment";
import {
  createReadonlyTossClient,
  type TossHttpTransport,
} from "../../src/infrastructure/toss/readonly-http-client";
import type { TokenManager } from "../../src/infrastructure/toss/token-manager";

const projectRoot = resolve(import.meta.dirname, "../..");

const forbiddenOperations = [
  "createOrder",
  "modifyOrder",
  "cancelOrder",
  "createConditionalOrder",
  "modifyConditionalOrder",
  "cancelConditionalOrder",
] as const;

const forbiddenUpstreamMutations = [
  ["POST", "/api/v1/orders"],
  ["POST", "/api/v1/orders/{orderId}/modify"],
  ["POST", "/api/v1/orders/{orderId}/cancel"],
  ["POST", "/api/v1/conditional-orders"],
  ["POST", "/api/v1/conditional-orders/{conditionalOrderId}/modify"],
  ["DELETE", "/api/v1/conditional-orders/{conditionalOrderId}"],
] as const;

const sourceExtensions = new Set([
  ".cjs",
  ".cts",
  ".js",
  ".jsx",
  ".mjs",
  ".mts",
  ".ts",
  ".tsx",
]);

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = resolve(root, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return sourceExtensions.has(extname(entry.name)) ? [path] : [];
  });
}

function decodeSource(source: string): string {
  let decoded = source
    .replace(/\\u002f/gi, "/")
    .replace(/\\x2f/gi, "/")
    .replace(/\\u002d/gi, "-")
    .replace(/\\x2d/gi, "-");

  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }

  return decoded
    .replace(/\$\{[^}]*\}/g, "{parameter}")
    .replace(/["'`\s+]/g, "")
    .toLowerCase();
}

function hasMethod(source: string, method: string): boolean {
  const normalized = decodeSource(source);
  const lowerMethod = method.toLowerCase();
  return (
    normalized.includes(`method:${lowerMethod}`) ||
    normalized.includes(`method=${lowerMethod}`) ||
    normalized.includes(`${lowerMethod}:`) ||
    normalized.includes(`function${lowerMethod}(`) ||
    normalized.includes(`const${lowerMethod}=`)
  );
}

function endpointPattern(path: string): RegExp {
  const normalized = path
    .toLowerCase()
    .split(/\{[^}]+\}/)
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("[a-z0-9._~{}-]+");
  return new RegExp(`${normalized}(?:[/?#},);]|$)`, "i");
}

function detectForbiddenMutation(source: string): string[] {
  const normalized = decodeSource(source);
  return forbiddenUpstreamMutations
    .filter(
      ([method, path]) =>
        hasMethod(source, method) && endpointPattern(path).test(normalized),
    )
    .map(([method, path]) => `${method} ${path}`);
}

function routeExports(source: string): string[] {
  return Array.from(
    source.matchAll(
      /export\s+(?:(?:async\s+)?function|const)\s+(GET|POST|PUT|PATCH|DELETE)\b/g,
    ),
    (match) => match[1],
  );
}

function expectNoProductionViolations(): void {
  const files = [
    ...sourceFiles(resolve(projectRoot, "app")),
    ...sourceFiles(resolve(projectRoot, "src")),
    ...sourceFiles(resolve(projectRoot, "scripts")),
  ];
  const operationPattern = new RegExp(
    `\\b(?:${forbiddenOperations.join("|")})\\b`,
  );
  const violations: string[] = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const path = relative(projectRoot, file).replaceAll("\\", "/");
    if (operationPattern.test(source)) {
      violations.push(`${path}: forbidden operation export or reference`);
    }
    for (const mutation of detectForbiddenMutation(source)) {
      violations.push(`${path}: ${mutation}`);
    }

    if (
      path.startsWith("app/api/") &&
      /(?:^|\/)(?:orders|conditional-orders)(?:\/|$)/.test(path)
    ) {
      const mutationMethods = routeExports(source).filter(
        (method) => method !== "GET",
      );
      for (const method of mutationMethods) {
        violations.push(`${path}: ${method} order route`);
      }
    }
  }

  expect(violations).toEqual([]);
}

function expectInternalSpecReadonlyOrders(): void {
  const source = readFileSync(
    resolve(projectRoot, "specs/my-wts-bff-openapi.yaml"),
    "utf8",
  );
  const paths = [
    "/orders",
    "/orders/{orderId}",
    "/conditional-orders",
    "/conditional-orders/{conditionalOrderId}",
  ];

  for (const path of paths) {
    const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const block = source.match(
      new RegExp(
        `^  ${escaped}:\\r?\\n([\\s\\S]*?)(?=^  /|^components:|\\z)`,
        "m",
      ),
    )?.[1];
    expect(block, `${path} must remain declared`).toBeDefined();
    expect(block).toMatch(/^    get:/m);
    expect(block).not.toMatch(/^    (?:post|put|patch|delete):/m);
  }
}

function expectSafeEnvironmentAndScripts(): void {
  const sources = [
    ".env.example",
    "templates/.env.example",
    "package.json",
    "src/infrastructure/config/environment.ts",
  ]
    .map((path) => readFileSync(resolve(projectRoot, path), "utf8"))
    .join("\n");

  expect(sources).not.toMatch(
    /ALLOW_LIVE_ORDER|ENABLE_REAL_ORDER|ENABLE_LIVE_ORDER|ORDER_MUTATION|NEXT_PUBLIC_(?:TOSS|ORDER)/i,
  );
}

function expectBuildRoutesReadonly(): void {
  const manifestPath = resolve(
    projectRoot,
    ".next/server/app-paths-manifest.json",
  );
  if (!existsSync(manifestPath)) return;

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    string
  >;
  for (const [route, compiledPath] of Object.entries(manifest)) {
    if (
      !/^\/api\/v1\/(?:orders|conditional-orders)(?:\/|$)/.test(route) ||
      !route.endsWith("/route")
    ) {
      continue;
    }
    const sourcePath = resolve(
      projectRoot,
      compiledPath.replace(/\.js$/, ".ts"),
    );
    expect(existsSync(sourcePath), `${route} source must be inspectable`).toBe(
      true,
    );
    expect(routeExports(readFileSync(sourcePath, "utf8"))).toEqual(["GET"]);
  }
}

function createReadonlyClient(transport: TossHttpTransport) {
  const environment = parseServerEnvironment({
    ALLOW_LIVE_TOSS_API: "true",
    ["TOSS_CLIENT_ID"]: ["fixture", "client"].join("-"),
    ["TOSS_CLIENT_SECRET"]: ["fixture", "credential"].join("-"),
  });
  const tokenManager: TokenManager = {
    withAccessToken: async (consumer) =>
      consumer(["fixture", "readonly", "token"].join("-")),
    invalidate: vi.fn(),
  };
  return createReadonlyTossClient({
    environment,
    tokenManager,
    transport,
  });
}

describe("permanent readonly Toss boundary", () => {
  it.each(forbiddenOperations)(
    "detects forbidden generated or runtime operation %s",
    (operation) => {
      const fixture = `export async function ${operation}() { return true; }`;
      expect(
        new RegExp(`\\b(?:${forbiddenOperations.join("|")})\\b`).test(fixture),
      ).toBe(true);
    },
  );

  it.each(forbiddenUpstreamMutations)(
    "detects forbidden upstream pair %s %s",
    (method, path) => {
      expect(
        detectForbiddenMutation(
          `transport.send({ method: "${method}", url: "https://openapi.tossinvest.com${path}" })`,
        ),
      ).toContain(`${method} ${path}`);
    },
  );

  it("detects encoded and computed mutation path bypasses", () => {
    expect(
      detectForbiddenMutation(
        'transport.send({ method: "POST", path: "/api/v1/" + "orders?dry=false" })',
      ),
    ).toContain("POST /api/v1/orders");
    expect(
      detectForbiddenMutation(
        'transport.send({ method: "POST", path: "/api/v1/orders/" + orderId + "/%6d%6f%64%69%66%79" })',
      ),
    ).toContain("POST /api/v1/orders/{orderId}/modify");
    expect(
      detectForbiddenMutation(
        'transport.send({ method: "DELETE", path: "/api/v1/conditional-orders/" + id + "?reason=fixture" })',
      ),
    ).toContain("DELETE /api/v1/conditional-orders/{conditionalOrderId}");
  });

  it("allows OAuth, readonly GET, local mutations, and descriptive order text", () => {
    const allowed = [
      'transport.send({ method: "POST", path: "/oauth2/token" })',
      'transport.send({ method: "GET", path: "/api/v1/orders" })',
      'fetch("/api/v1/auth/login", { method: "POST" })',
      'fetch("/api/v1/watchlists/item", { method: "DELETE" })',
      'const labels = ["orders", "매수 호가", "매도 호가"];',
    ];
    for (const source of allowed) {
      expect(detectForbiddenMutation(source)).toEqual([]);
    }
  });

  it("keeps the actual production tree and internal order spec readonly", () => {
    expectNoProductionViolations();
    expectInternalSpecReadonlyOrders();
    expectSafeEnvironmentAndScripts();
    expectBuildRoutesReadonly();
  });

  it.each(forbiddenUpstreamMutations)(
    "rejects %s %s before calling the injected transport",
    async (method, path) => {
      const send = vi.fn<TossHttpTransport["send"]>();
      const client = createReadonlyClient({ send });

      await expect(
        client.get({
          method,
          path: path
            .replace("{orderId}", "fixture-order")
            .replace("{conditionalOrderId}", "fixture-conditional"),
          operation: "fixtureForbiddenMutation",
        } as never),
      ).rejects.toMatchObject({ code: "TOSS_GET_METHOD_REQUIRED" });
      expect(send).not.toHaveBeenCalled();
    },
  );

  it("keeps OAuth POST from widening the readonly market transport", () => {
    const tokenManager = readFileSync(
      resolve(projectRoot, "src/infrastructure/toss/token-manager.ts"),
      "utf8",
    );
    const readonlyClient = readFileSync(
      resolve(projectRoot, "src/infrastructure/toss/readonly-http-client.ts"),
      "utf8",
    );

    expect(tokenManager).toContain('method: "POST"');
    expect(readonlyClient).not.toMatch(
      /TossHttpTransportRequest[\s\S]*method:\s*["'](?:POST|PUT|PATCH|DELETE)["']/,
    );
    expect(readonlyClient).toContain('method: "GET"');
  });
});
