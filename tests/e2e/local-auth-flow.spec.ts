import { createHash, randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

import {
  closeDatabase,
  openDatabase,
} from "../../src/infrastructure/database/database";

const SESSION_COOKIE_NAME = "my_wts_session";
const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const TEST_CREDENTIAL = `E2e-${randomUUID()}-Aa1!`;
const INVALID_CREDENTIAL = `Bad-${randomUUID()}-Aa1!`;

type AuthErrorBody = {
  error: {
    requestId: string;
    code: string;
    message: string;
    retryable: boolean;
    details: Record<string, unknown>;
  };
};

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Origin: LOOPBACK_ORIGIN,
  };
}

function safeErrorContract(body: AuthErrorBody) {
  return {
    code: body.error.code,
    message: body.error.message,
    retryable: body.error.retryable,
    details: body.error.details,
  };
}

async function sessionCookie(context: BrowserContext) {
  const cookies = await context.cookies(LOOPBACK_ORIGIN);
  return cookies.find((cookie) => cookie.name === SESSION_COOKIE_NAME);
}

function blockExternalNetwork(
  context: BrowserContext,
  externalRequests: string[],
) {
  return context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (
      (url.protocol === "http:" || url.protocol === "ws:") &&
      url.hostname === "127.0.0.1" &&
      url.port === "3000"
    ) {
      await route.continue();
      return;
    }

    externalRequests.push(`${url.protocol}//${url.host}`);
    await route.abort();
  });
}

async function fillLogin(page: Page, username: string, password: string) {
  await page.getByLabel("사용자명").fill(username);
  await page.getByLabel("비밀번호").fill(password);
}

test("signup → logout → login keeps the local auth boundary", async ({
  browser,
  context,
  page,
}) => {
  const databasePath = process.env.DATABASE_PATH;
  expect(databasePath).toBeTruthy();

  const username = `e2e.${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const missingUsername = `none.${randomUUID()
    .replaceAll("-", "")
    .slice(0, 11)}`;
  const displayName = "E2E 로컬 사용자";
  const externalRequests: string[] = [];
  const browserMessages: string[] = [];
  const observedUrls: string[] = [];
  const responseBodies: string[] = [];

  await blockExternalNetwork(context, externalRequests);
  page.on("console", (message) => browserMessages.push(message.text()));
  page.on("request", (request) => observedUrls.push(request.url()));

  await page.goto("/portfolio?section=summary");
  await expect(page).toHaveURL(
    /\/login\?next=%2Fportfolio%3Fsection%3Dsummary$/,
  );

  await page.getByRole("link", { name: "회원가입" }).click();
  await expect(page).toHaveURL("/signup");
  await page.getByLabel("사용자명").fill(username);
  await page.getByLabel("표시 이름").fill(displayName);
  await page.getByLabel("비밀번호", { exact: true }).fill(TEST_CREDENTIAL);
  await page.getByLabel("비밀번호 확인").fill(TEST_CREDENTIAL);

  const signupResponsePromise = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/v1/auth/signup") &&
      response.request().method() === "POST",
  );
  await page.getByRole("button", { name: "회원가입" }).click();
  const signupResponse = await signupResponsePromise;
  expect(signupResponse.status()).toBe(201);
  await expect(page).toHaveURL("/market", { timeout: 15_000 });

  const firstCookie = await sessionCookie(context);
  expect(firstCookie).toMatchObject({
    httpOnly: true,
    name: SESSION_COOKIE_NAME,
    path: "/",
    sameSite: "Strict",
    secure: false,
  });
  expect(firstCookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);

  const firstSessionResponse = await context.request.get(
    "/api/v1/auth/session",
  );
  expect(firstSessionResponse.status()).toBe(200);
  const firstSessionBody = await firstSessionResponse.json();
  responseBodies.push(JSON.stringify(firstSessionBody));
  expect(firstSessionBody.data.user).toEqual({
    id: expect.stringMatching(/^usr_/),
    username,
    displayName,
  });
  expect(Object.keys(firstSessionBody.data.user).sort()).toEqual([
    "displayName",
    "id",
    "username",
  ]);

  const protectedResponse = await page.goto("/portfolio");
  expect(protectedResponse?.status()).toBe(200);
  await expect(page).toHaveURL("/portfolio");
  await expect(page.getByRole("heading", { name: "보유자산" })).toBeVisible();

  const duplicateResponse = await context.request.post("/api/v1/auth/signup", {
    data: {
      username,
      displayName: "중복 사용자",
      ["password"]: TEST_CREDENTIAL,
    },
    headers: authHeaders(),
  });
  expect(duplicateResponse.status()).toBe(409);
  const duplicateBody = (await duplicateResponse.json()) as AuthErrorBody;
  responseBodies.push(JSON.stringify(duplicateBody));
  expect(duplicateBody.error.code).toBe("USERNAME_ALREADY_EXISTS");

  const otherContext = await browser.newContext({ baseURL: LOOPBACK_ORIGIN });
  await blockExternalNetwork(otherContext, externalRequests);
  try {
    const wrongPasswordResponse = await otherContext.request.post(
      "/api/v1/auth/login",
      {
        data: { username, ["password"]: INVALID_CREDENTIAL },
        headers: authHeaders(),
      },
    );
    const missingUserResponse = await otherContext.request.post(
      "/api/v1/auth/login",
      {
        data: {
          username: missingUsername,
          ["password"]: INVALID_CREDENTIAL,
        },
        headers: authHeaders(),
      },
    );
    expect(wrongPasswordResponse.status()).toBe(401);
    expect(missingUserResponse.status()).toBe(401);
    const wrongPasswordBody =
      (await wrongPasswordResponse.json()) as AuthErrorBody;
    const missingUserBody = (await missingUserResponse.json()) as AuthErrorBody;
    responseBodies.push(
      JSON.stringify(wrongPasswordBody),
      JSON.stringify(missingUserBody),
    );
    expect(safeErrorContract(wrongPasswordBody)).toEqual(
      safeErrorContract(missingUserBody),
    );
    expect(wrongPasswordBody.error.code).toBe("INVALID_CREDENTIALS");

    const otherLoginResponse = await otherContext.request.post(
      "/api/v1/auth/login",
      {
        data: { username, ["password"]: TEST_CREDENTIAL },
        headers: authHeaders(),
      },
    );
    expect(otherLoginResponse.status()).toBe(204);
    const otherCookie = await sessionCookie(otherContext);
    expect(otherCookie?.value).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(otherCookie?.value).not.toBe(firstCookie?.value);

    const logoutResponse = await context.request.post("/api/v1/auth/logout", {
      data: {},
      headers: authHeaders(),
    });
    expect(logoutResponse.status()).toBe(204);
    expect(logoutResponse.headers()["cache-control"]).toBe("no-store");
    const clearedCookieHeader = logoutResponse.headers()["set-cookie"];
    expect(clearedCookieHeader).toContain("my_wts_session=");
    expect(clearedCookieHeader).toContain("Max-Age=0");
    expect(clearedCookieHeader).toContain("Path=/");
    expect(clearedCookieHeader).toContain("HttpOnly");
    expect(clearedCookieHeader).toMatch(/SameSite=Strict/i);
    expect(await sessionCookie(context)).toBeUndefined();

    const loggedOutSessionResponse = await context.request.get(
      "/api/v1/auth/session",
    );
    expect(loggedOutSessionResponse.status()).toBe(401);
    const loggedOutSessionBody =
      (await loggedOutSessionResponse.json()) as AuthErrorBody;
    responseBodies.push(JSON.stringify(loggedOutSessionBody));
    expect(loggedOutSessionBody.error.code).toBe("AUTH_REQUIRED");

    expect(
      (await otherContext.request.get("/api/v1/auth/session")).status(),
    ).toBe(200);

    await page.goto("/portfolio");
    await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);

    await page.goto("/login?next=https://attacker.example/steal");
    await fillLogin(page, username, TEST_CREDENTIAL);
    const loginResponsePromise = page.waitForResponse(
      (response) =>
        response.url().endsWith("/api/v1/auth/login") &&
        response.request().method() === "POST",
    );
    await page.getByRole("button", { name: "로그인" }).click();
    const loginResponse = await loginResponsePromise;
    expect(loginResponse.status()).toBe(204);
    await expect(page).toHaveURL("/market", { timeout: 15_000 });

    const newCookie = await sessionCookie(context);
    expect(newCookie).toMatchObject({
      httpOnly: true,
      path: "/",
      sameSite: "Strict",
    });
    expect(newCookie?.value).not.toBe(firstCookie?.value);
    expect(newCookie?.value).not.toBe(otherCookie?.value);

    const finalSessionResponse = await context.request.get(
      "/api/v1/auth/session",
    );
    expect(finalSessionResponse.status()).toBe(200);
    const finalSessionBody = await finalSessionResponse.json();
    responseBodies.push(JSON.stringify(finalSessionBody));
    expect(finalSessionBody.data.user).toEqual({
      id: firstSessionBody.data.user.id,
      username,
      displayName,
    });

    const finalProtectedResponse = await page.goto("/portfolio");
    expect(finalProtectedResponse?.status()).toBe(200);
    await expect(page).toHaveURL("/portfolio");
    await expect(page.getByRole("heading", { name: "보유자산" })).toBeVisible();

    const database = openDatabase(databasePath!);
    try {
      const user = database.$client
        .prepare(
          "SELECT username_normalized, password_hash FROM users WHERE id = ?",
        )
        .get(firstSessionBody.data.user.id) as {
        username_normalized: string;
        password_hash: string;
      };
      expect(user.username_normalized).toBe(username);
      expect(user.password_hash).toMatch(
        /^scrypt\$v1\$N=32768,r=8,p=1\$[A-Za-z0-9_-]+\$[A-Za-z0-9_-]+$/,
      );
      expect(user.password_hash).not.toContain(TEST_CREDENTIAL);

      const sessionHashes = (
        database.$client
          .prepare("SELECT token_hash FROM sessions WHERE user_id = ?")
          .all(firstSessionBody.data.user.id) as Array<{ token_hash: string }>
      ).map((session) => session.token_hash);
      expect(sessionHashes).not.toContain(tokenHash(firstCookie!.value));
      expect(sessionHashes).toContain(tokenHash(otherCookie!.value));
      expect(sessionHashes).toContain(tokenHash(newCookie!.value));
      expect(sessionHashes).toHaveLength(2);
      expect(sessionHashes.every((hash) => /^[a-f0-9]{64}$/.test(hash))).toBe(
        true,
      );

      const persistedData = JSON.stringify({ user, sessionHashes });
      expect(persistedData).not.toContain(TEST_CREDENTIAL);
      expect(persistedData).not.toContain(firstCookie!.value);
      expect(persistedData).not.toContain(otherCookie!.value);
      expect(persistedData).not.toContain(newCookie!.value);
    } finally {
      closeDatabase(database);
    }
  } finally {
    await otherContext.close();
  }

  expect(externalRequests).toEqual([]);
  expect(observedUrls.some((url) => url.includes(TEST_CREDENTIAL))).toBe(false);
  const exposedOutput = [...browserMessages, ...responseBodies].join("\n");
  expect(exposedOutput).not.toContain(TEST_CREDENTIAL);
  expect(exposedOutput).not.toContain(firstCookie!.value);
  expect(exposedOutput).not.toMatch(/passwordHash|tokenHash|stack trace/i);
});
