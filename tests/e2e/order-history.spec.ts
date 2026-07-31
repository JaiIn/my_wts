import { randomUUID } from "node:crypto";

import {
  expect,
  test,
  type APIResponse,
  type BrowserContext,
} from "@playwright/test";

const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const TEST_CREDENTIAL = `Orders-${randomUUID()}-Aa1!`;
const ORDER_PATHS = ["/api/v1/orders", "/api/v1/conditional-orders"] as const;

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

async function expectSafeSuccess(response: APIResponse) {
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toBe("no-store");
  const body = await response.json();
  expect(body.meta.requestId).toMatch(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
  );
  const serialized = JSON.stringify(body);
  expect(serialized).not.toMatch(
    /"accountSeq"|"accountNo"|authorization|cookie|sqlite|stack|raw upstream/i,
  );
  return body;
}

async function chooseAccount(
  page: import("@playwright/test").Page,
  listItemIndex: number,
) {
  await page.goto("/settings");
  const item = page.getByRole("listitem").nth(listItemIndex);
  const responsePromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/session/account" &&
      response.request().method() === "PUT",
  );
  await item.getByRole("button", { name: "이 계좌 선택" }).click();
  expect((await responsePromise).status()).toBe(204);
  await expect(item.getByText("현재 선택된 계좌")).toBeVisible();
}

test("readonly general and conditional order history stays isolated and mutation-free", async ({
  context,
  page,
}) => {
  test.setTimeout(90_000);
  const username = `orders.${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const observedApiRequests: string[] = [];
  const accountRefs: string[] = [];
  const observedOrderIds: string[] = [];

  await blockExternalNetwork(context, externalRequests);
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.origin === LOOPBACK_ORIGIN && url.pathname.startsWith("/api/")) {
      observedApiRequests.push(`${request.method()} ${url.pathname}`);
    }
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  await page.goto("/conditional-orders");
  await expect(page).toHaveURL(/\/login\?next=%2Fconditional-orders$/);

  const signup = await context.request.post("/api/v1/auth/signup", {
    data: {
      username,
      displayName: "M06 E2E 사용자",
      ["password"]: TEST_CREDENTIAL,
    },
    headers: authHeaders(),
  });
  expect(signup.status()).toBe(201);

  for (const path of ORDER_PATHS) {
    const blocked = await context.request.get(`${path}?status=OPEN`);
    expect(blocked.status()).toBe(409);
    expect((await blocked.json()).error.code).toBe("ACCOUNT_NOT_SELECTED");
  }
  await page.goto("/orders");
  await expect(page.getByText("선택된 계좌가 없습니다.")).toBeVisible();
  await page.goto("/conditional-orders");
  await expect(page.getByText("선택된 계좌가 없습니다.")).toBeVisible();

  const accounts = await context.request.get("/api/v1/accounts");
  const accountsBody = await expectSafeSuccess(accounts);
  expect(accountsBody.data.accounts).toHaveLength(3);
  for (const account of accountsBody.data.accounts as Array<{
    accountRef: string;
    maskedAccountNo: string;
    selected: boolean;
  }>) {
    accountRefs.push(account.accountRef);
    expect(account.maskedAccountNo).toMatch(/^\*{7}\d{4}$/);
    expect(account.selected).toBe(false);
  }
  await chooseAccount(page, 0);

  await page.goto("/orders");
  await expect(page.getByText(/주문내역 조회 전용입니다/)).toBeVisible();
  await expect(
    page.getByText(/다른 채널에서 생성된 주문도 표시될 수 있습니다/),
  ).toBeVisible();
  await expect(page.getByRole("tab", { name: "OPEN" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const openRows = page.getByRole("table").locator("tbody tr");
  await expect(openRows).toHaveCount(5);
  await expect(page.getByText("알 수 없는 주문 상태")).toBeVisible();
  await expect(page.getByText("0.000001", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "더 보기" })).toHaveCount(0);

  const partialRow = openRows.filter({ hasText: "PARTIAL_FILLED" });
  await expect(partialRow).toHaveCount(1);
  await partialRow.getByRole("link", { name: "상세 보기" }).click();
  await expect(page).toHaveURL(/\/orders\/fixture-order-3$/);
  await expect(page.getByRole("heading", { name: "체결 상세" })).toBeVisible();
  await expect(page.getByText("2.500001", { exact: true })).toBeVisible();
  await expect(page.getByText("상태 타임라인")).toBeVisible();
  await expect(page.getByText(/0과 미제공 값은 구분됩니다/)).toBeVisible();
  observedOrderIds.push("fixture-order-3");

  for (const orderId of ["fixture-order-5", "fixture-order-6"]) {
    await page.goto(`/orders/${orderId}`);
    await expect(
      page.getByRole("heading", { name: "체결 상세" }),
    ).toBeVisible();
    await expect(page.getByText("2.500001", { exact: true })).toBeVisible();
    observedOrderIds.push(orderId);
  }

  await page.goto("/orders");
  await page.getByRole("tab", { name: "CLOSED" }).click();
  await expect(
    page.getByRole("heading", { name: "CLOSED 주문" }),
  ).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(8);
  await expect(page.getByText("9007199254740993.000000000001")).toHaveCount(
    2,
  );
  await page.getByLabel("종목 코드").fill("TSTX");
  await page.getByLabel("시작일").fill("2026-01-01");
  await page.getByLabel("종료일").fill("2026-01-31");
  await page.getByRole("button", { name: "조회 조건 적용" }).click();
  const filteredRows = page.getByRole("table").locator("tbody tr");
  await expect(filteredRows).toHaveCount(5);
  for (const text of await filteredRows.allTextContents()) {
    expect(text).toContain("TSTX");
  }
  await page.getByRole("tab", { name: "OPEN" }).click();
  await expect(page.getByRole("heading", { name: "OPEN 주문" })).toBeVisible();
  await expect(page.getByText("9007199254740993.000000000001")).toHaveCount(0);

  const firstClosed = await context.request.get(
    "/api/v1/orders?status=CLOSED&limit=2",
  );
  const firstClosedBody = await expectSafeSuccess(firstClosed);
  expect(firstClosedBody.data.orders).toHaveLength(2);
  expect(firstClosedBody.data.hasNext).toBe(true);
  const orderCursor = firstClosedBody.data.nextCursor as string;
  expect(orderCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  const secondClosed = await context.request.get(
    `/api/v1/orders?status=CLOSED&limit=2&cursor=${encodeURIComponent(orderCursor)}`,
  );
  const secondClosedBody = await expectSafeSuccess(secondClosed);
  const firstIds = firstClosedBody.data.orders.map(
    (order: { orderId: string }) => order.orderId,
  );
  const secondIds = secondClosedBody.data.orders.map(
    (order: { orderId: string }) => order.orderId,
  );
  expect(new Set([...firstIds, ...secondIds]).size).toBe(4);
  const inclusive = await context.request.get(
    "/api/v1/orders?status=CLOSED&from=2026-01-06&to=2026-01-06",
  );
  const inclusiveBody = await expectSafeSuccess(inclusive);
  expect(inclusiveBody.data.orders).toHaveLength(1);

  const missingOrder = await context.request.get(
    "/api/v1/orders/missing-order",
  );
  expect(missingOrder.status()).toBe(404);
  expect((await missingOrder.json()).error.code).toBe("UPSTREAM_NOT_FOUND");
  expect(
    (await context.request.get("/api/v1/orders/%252Funsafe")).status(),
  ).toBe(400);

  await page.goto("/conditional-orders");
  await expect(page.getByText(/조건주문 내역 조회 전용입니다/)).toBeVisible();
  await expect(
    page.getByText(/조건을 감시하거나 주문을 실행하지 않으며/),
  ).toBeVisible();
  await expect(page.getByRole("table").locator("tbody tr")).toHaveCount(4);
  await expect(page.getByText("단일 조건")).toBeVisible();
  await expect(page.getByText("OCO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("OTO", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("알 수 없는 값")).toBeVisible();

  const singleRow = page
    .getByRole("table")
    .locator("tbody tr")
    .filter({ hasText: "SINGLE" });
  await singleRow.getByRole("link", { name: "상세 보기" }).click();
  await expect(
    page.getByRole("heading", { name: "첫 번째 조건" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "두 번째 조건" })).toHaveCount(
    0,
  );
  await expect(page.getByText("미제공", { exact: true })).toHaveCount(2);

  await page.goto("/conditional-orders");
  await page.getByRole("tab", { name: "CLOSED" }).click();
  await expect(
    page.getByRole("heading", { name: "CLOSED 조건주문" }),
  ).toBeVisible();
  const completedRow = page
    .getByRole("table")
    .locator("tbody tr")
    .filter({ hasText: "COMPLETED" });
  await completedRow.getByRole("link", { name: "상세 보기" }).click();
  await expect(
    page.getByRole("heading", { name: "두 번째 조건" }),
  ).toBeVisible();
  await expect(
    page.getByRole("link", { name: "일반 주문 상세 보기" }),
  ).toBeVisible();
  await page.getByRole("link", { name: "일반 주문 상세 보기" }).click();
  await expect(
    page.getByRole("heading", { name: "일반 주문 상세" }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "체결 상세" })).toBeVisible();

  const firstConditional = await context.request.get(
    "/api/v1/conditional-orders?status=OPEN&limit=2",
  );
  const firstConditionalBody = await expectSafeSuccess(firstConditional);
  expect(firstConditionalBody.data.conditionalOrders).toHaveLength(2);
  expect(firstConditionalBody.data.hasNext).toBe(true);
  const conditionalCursor = firstConditionalBody.data.nextCursor as string;
  expect(conditionalCursor).toMatch(/^[A-Za-z0-9_-]+$/);
  const nextConditional = await context.request.get(
    `/api/v1/conditional-orders?status=OPEN&limit=2&cursor=${encodeURIComponent(conditionalCursor)}`,
  );
  const nextConditionalBody = await expectSafeSuccess(nextConditional);
  expect(nextConditionalBody.data.conditionalOrders).toHaveLength(2);
  expect(
    new Set([
      ...firstConditionalBody.data.conditionalOrders.map(
        (order: { conditionalOrderId: string }) => order.conditionalOrderId,
      ),
      ...nextConditionalBody.data.conditionalOrders.map(
        (order: { conditionalOrderId: string }) => order.conditionalOrderId,
      ),
    ]).size,
  ).toBe(4);
  expect(
    (
      await context.request.get(
        "/api/v1/conditional-orders/missing-conditional",
      )
    ).status(),
  ).toBe(404);
  expect(
    (
      await context.request.get("/api/v1/conditional-orders/%252Funsafe")
    ).status(),
  ).toBe(400);

  await chooseAccount(page, 1);
  for (const orderId of observedOrderIds) {
    expect(
      (await context.request.get(`/api/v1/orders/${orderId}`)).status(),
    ).toBe(404);
  }
  await page.goto("/orders");
  await expect(page.getByText("ACCTB", { exact: true })).toBeVisible();
  await expect(page.getByText("TSTX", { exact: true })).toHaveCount(0);
  await page.goto("/conditional-orders");
  await expect(page.getByText("ACCTB", { exact: true })).toBeVisible();
  await expect(page.getByText("OCO", { exact: true })).toHaveCount(0);

  await chooseAccount(page, 2);
  await page.goto("/orders");
  await expect(
    page.getByText("조건에 맞는 주문 내역이 없습니다."),
  ).toBeVisible();
  await page.goto("/conditional-orders");
  await expect(
    page.getByText("조건에 맞는 조건주문 내역이 없습니다."),
  ).toBeVisible();

  await page.goto("/settings");
  const clearPromise = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/session/account" &&
      response.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "선택 해제" }).click();
  expect((await clearPromise).status()).toBe(204);
  for (const path of ORDER_PATHS) {
    const blocked = await context.request.get(`${path}?status=OPEN`);
    expect(blocked.status()).toBe(409);
  }
  await page.goto("/orders");
  await expect(page.getByText("선택된 계좌가 없습니다.")).toBeVisible();

  await chooseAccount(page, 0);
  const logout = await context.request.post("/api/v1/auth/logout", {
    data: {},
    headers: authHeaders(),
  });
  expect(logout.status()).toBe(204);
  await page.goto("/orders");
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  await page.goto("/conditional-orders");
  await expect(page).toHaveURL(/\/login\?next=%2Fconditional-orders$/);

  const cookies = (await context.cookies()).map((entry) => entry.value);
  const storage = await page.evaluate(async () => ({
    local: Object.values(localStorage),
    session: Object.values(sessionStorage),
    indexedDb: indexedDB.databases ? await indexedDB.databases() : [],
  }));
  for (const reference of accountRefs) {
    expect(cookies).not.toContain(reference);
    expect(storage.local).not.toContain(reference);
    expect(storage.session).not.toContain(reference);
  }
  expect(storage.indexedDb).toEqual([]);
  expect(
    observedApiRequests.some(
      (request) =>
        /POST|PUT|PATCH|DELETE/.test(request) && /orders/.test(request),
    ),
  ).toBe(false);
  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
