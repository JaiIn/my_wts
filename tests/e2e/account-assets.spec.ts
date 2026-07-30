import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext } from "@playwright/test";

const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const TEST_CREDENTIAL = `Account-${randomUUID()}-Aa1!`;
const ACCOUNT_SCOPED_PATHS = [
  "/api/v1/portfolio/holdings",
  "/api/v1/order-info/buying-power",
  "/api/v1/order-info/sellable-quantity",
  "/api/v1/order-info/commissions",
] as const;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Origin: LOOPBACK_ORIGIN,
  };
}

async function blockExternalNetwork(
  context: BrowserContext,
  externalRequests: string[],
) {
  await context.route("**/*", async (route) => {
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

test("account selection, portfolio caches, clear, and logout stay isolated", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);
  const username = `account.${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestCounts = new Map<string, number>();
  const accountRefs: string[] = [];

  await blockExternalNetwork(context, externalRequests);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin !== LOOPBACK_ORIGIN || !url.pathname.startsWith("/api/")) {
      return;
    }
    const key = `${request.method()} ${url.pathname}`;
    requestCounts.set(key, (requestCounts.get(key) ?? 0) + 1);
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);
  const signupResponse = await context.request.post("/api/v1/auth/signup", {
    data: {
      username,
      displayName: "M05 E2E 사용자",
      ["password"]: TEST_CREDENTIAL,
    },
    headers: authHeaders(),
  });
  expect(signupResponse.status()).toBe(201);
  await page.goto("/portfolio");

  await expect(page.getByText("선택된 계좌가 없습니다.")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "설정에서 계좌 선택" }),
  ).toBeVisible();
  for (const path of ACCOUNT_SCOPED_PATHS) {
    expect(requestCounts.get(`GET ${path}`) ?? 0).toBe(0);
  }
  await expect(page.locator("body")).not.toContainText(
    /accountSeq|00000001234/,
  );

  const accountsResponsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/accounts" &&
      response.request().method() === "GET",
  );
  await page.getByRole("link", { name: "설정에서 계좌 선택" }).click();
  const accountsResponse = await accountsResponsePromise;
  expect(accountsResponse.status()).toBe(200);
  const accountsEnvelope = await accountsResponse.json();
  for (const account of accountsEnvelope.data.accounts as Array<{
    accountRef: string;
  }>) {
    accountRefs.push(account.accountRef);
  }
  await expect(
    page.getByRole("list", { name: "Toss 계좌 목록" }),
  ).toBeVisible();
  const maskedNumbers = page.getByTestId("masked-account-no");
  expect(await maskedNumbers.count()).toBe(3);
  for (const text of await maskedNumbers.allTextContents()) {
    expect(text).toMatch(/^\*{7}\d{4}$/);
  }
  await expect(page.locator("body")).not.toContainText(
    /00000001234|00000005678|00000009012|accountSeq/,
  );

  const firstSelectionPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/session/account" &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "이 계좌 선택" }).first().click();
  expect((await firstSelectionPromise).status()).toBe(204);
  await expect(page.getByText("현재 선택된 계좌")).toBeVisible();
  await page.reload();
  await expect(page.getByText("현재 선택된 계좌")).toBeVisible();

  await page.goto("/portfolio");
  await expect(page.getByRole("table")).toBeVisible();
  await expect(page.getByText("테스트 삼성전자")).toBeVisible();
  await expect(page.getByText("Test Apple")).toBeVisible();
  await expect(page.getByText(/9007199254740993 KRW/)).toBeVisible();
  await expect(page.getByText(/실제 주문 기능은 없습니다/)).toBeVisible();
  expect(
    requestCounts.get("GET /api/v1/order-info/sellable-quantity") ?? 0,
  ).toBe(0);

  const firstScopedCounts = {
    holdings: requestCounts.get("GET /api/v1/portfolio/holdings") ?? 0,
    buyingPower: requestCounts.get("GET /api/v1/order-info/buying-power") ?? 0,
    commissions: requestCounts.get("GET /api/v1/order-info/commissions") ?? 0,
  };
  expect(firstScopedCounts).toEqual({
    holdings: 1,
    buyingPower: 1,
    commissions: 1,
  });
  await page.evaluate(() => Promise.resolve());
  expect(requestCounts.get("GET /api/v1/portfolio/holdings")).toBe(1);
  expect(requestCounts.get("GET /api/v1/order-info/buying-power")).toBe(1);
  expect(requestCounts.get("GET /api/v1/order-info/commissions")).toBe(1);

  const firstSellablePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
      "/api/v1/order-info/sellable-quantity",
  );
  await page.getByLabel("종목 코드").fill("005930");
  await page.getByRole("button", { name: "조회" }).click();
  expect((await firstSellablePromise).status()).toBe(200);
  await expect(page.getByText(/005930: 100/)).toBeVisible();
  expect(requestCounts.get("GET /api/v1/order-info/sellable-quantity")).toBe(1);
  await expect(
    page.getByRole("button", { name: /매수|매도|정정|취소|주문 제출/ }),
  ).toHaveCount(0);
  await expect(page.locator("form")).toHaveCount(0);

  await page.goto("/settings");
  const secondAccount = page
    .getByRole("listitem")
    .filter({ hasText: "연금저축" });
  const secondSelectionPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/session/account" &&
      response.request().method() === "PUT",
  );
  await secondAccount.getByRole("button", { name: "이 계좌 선택" }).click();
  expect((await secondSelectionPromise).status()).toBe(204);
  await expect(secondAccount.getByText("현재 선택된 계좌")).toBeVisible();

  await page.goto("/portfolio");
  await expect(page.getByText("보유 종목이 없습니다.")).toBeVisible();
  await expect(page.getByText(/0 KRW/)).toBeVisible();
  await expect(page.getByText(/시작일 미제공/)).toBeVisible();
  await expect(page.getByText("테스트 삼성전자")).toHaveCount(0);
  await expect(page.getByText("Test Apple")).toHaveCount(0);
  await expect(page.getByText(/005930: 100/)).toHaveCount(0);
  expect(requestCounts.get("GET /api/v1/portfolio/holdings")).toBe(2);
  expect(requestCounts.get("GET /api/v1/order-info/buying-power")).toBe(2);
  expect(requestCounts.get("GET /api/v1/order-info/commissions")).toBe(2);

  const secondSellablePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
      "/api/v1/order-info/sellable-quantity",
  );
  await page.getByLabel("종목 코드").fill("005930");
  await page.getByRole("button", { name: "조회" }).click();
  expect((await secondSellablePromise).status()).toBe(200);
  await expect(page.getByText(/005930: 0/)).toBeVisible();
  expect(requestCounts.get("GET /api/v1/order-info/sellable-quantity")).toBe(2);

  await page.goto("/settings");
  const clearPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/session/account" &&
      response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "선택 해제" }).click();
  expect((await clearPromise).status()).toBe(204);
  await expect(
    page.getByText("사용할 계좌를 직접 선택해 주세요."),
  ).toBeVisible();
  const beforeClearScoped = new Map(requestCounts);
  await page.goto("/portfolio");
  await expect(page.getByText("선택된 계좌가 없습니다.")).toBeVisible();
  for (const path of ACCOUNT_SCOPED_PATHS) {
    expect(requestCounts.get(`GET ${path}`) ?? 0).toBe(
      beforeClearScoped.get(`GET ${path}`) ?? 0,
    );
  }
  const blockedHoldings = await context.request.get(
    "/api/v1/portfolio/holdings",
  );
  expect(blockedHoldings.status()).toBe(409);
  const blockedEnvelope = await blockedHoldings.json();
  expect(blockedEnvelope.error.code).toBe("ACCOUNT_NOT_SELECTED");

  await page.goto("/settings");
  const reselectPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/session/account" &&
      response.request().method() === "PUT",
  );
  await page.getByRole("button", { name: "이 계좌 선택" }).first().click();
  expect((await reselectPromise).status()).toBe(204);
  const logoutResponse = await context.request.post("/api/v1/auth/logout", {
    data: {},
    headers: authHeaders(),
  });
  expect(logoutResponse.status()).toBe(204);
  await page.goto("/portfolio");
  await expect(page).toHaveURL(/\/login\?next=%2Fportfolio$/);

  const cookieValues = (await context.cookies()).map((cookie) => cookie.value);
  const browserStorage = await page.evaluate(() => [
    ...Object.values(localStorage),
    ...Object.values(sessionStorage),
  ]);
  for (const accountRef of accountRefs) {
    expect(cookieValues).not.toContain(accountRef);
    expect(browserStorage).not.toContain(accountRef);
  }
  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
