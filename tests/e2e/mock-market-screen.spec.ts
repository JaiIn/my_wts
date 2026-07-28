import { randomUUID } from "node:crypto";

import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const LOOPBACK_ORIGIN = "http://127.0.0.1:3000";
const TEST_CREDENTIAL = `Market-${randomUUID()}-Aa1!`;

function authHeaders() {
  return {
    "Content-Type": "application/json",
    Origin: LOOPBACK_ORIGIN,
  };
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

async function selectByKeyboard(page: Page, query: string) {
  const search = page.getByRole("combobox", {
    name: "종목 코드, 종목명 또는 시장",
  });
  await search.fill(query);
  await expect(
    page.getByRole("listbox", { name: "종목 검색 결과" }),
  ).toBeVisible();
  await search.press("ArrowDown");
  await expect(search).toHaveAttribute("aria-activedescendant", /option-0$/);
  await search.press("Enter");
}

async function waitForClientForm(page: Page) {
  const form = page.locator("form");
  await expect(form).toBeVisible();
  await expect
    .poll(() =>
      form.evaluate((element) =>
        Object.keys(element).some((key) => key.startsWith("__reactProps$")),
      ),
    )
    .toBe(true);
}

async function expectSelected(
  page: Page,
  symbol: string,
  market: string,
  price: string,
) {
  await expect(page.getByText(`${symbol} · ${market}`)).toBeVisible();
  await expect(page.getByTestId("last-price")).toHaveText(price);
}

test("authenticated mock market flow stays local, deterministic, and persistent", async ({
  context,
  page,
}) => {
  test.setTimeout(60_000);

  const username = `market.${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const externalRequests: string[] = [];
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  await blockExternalNetwork(context, externalRequests);
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/market");
  await expect(page).toHaveURL(/\/login\?next=%2Fmarket$/);
  await page.getByRole("link", { name: "회원가입" }).click();
  await expect(page).toHaveURL("/signup");
  await waitForClientForm(page);
  await page.getByLabel("사용자명").fill(username);
  await page.getByLabel("표시 이름").fill("M02 E2E 사용자");
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

  await expect(page.getByRole("heading", { name: "시장 홈" })).toBeVisible();
  await expectSelected(page, "005930", "KOSPI", "72,000 KRW");
  await expect(page.getByText("실시간 시세 아님")).toBeVisible();
  await expect(
    page.getByText(
      "개발용 고정 데이터이며 실제 투자 판단에 사용할 수 없습니다.",
    ),
  ).toBeVisible();
  await expect(page.getByText("정적 변동성 완화장치 발동")).toBeVisible();
  await expect(page.getByText("Asia/Seoul")).toBeVisible();
  const initialOrderbookRows = await page
    .getByRole("table", { name: "테스트 코리아 매도 및 매수 호가" })
    .locator("tbody tr")
    .allTextContents();
  expect(initialOrderbookRows).toEqual([
    expect.stringContaining("72,100 KRW"),
    expect.stringContaining("72,200 KRW"),
    expect.stringContaining("72,300 KRW"),
    expect.stringContaining("72,000 KRW"),
    expect.stringContaining("71,900 KRW"),
    expect.stringContaining("71,800 KRW"),
  ]);
  expect(
    await page.getByTestId("candle-chart").locator("canvas").count(),
  ).toBeGreaterThan(0);
  await expect(
    page.getByRole("table", {
      name: "테스트 코리아 1d 캔들 원본 데이터",
    }),
  ).toBeVisible();

  await expect(page.getByTestId("candle-count")).toHaveText("100개");
  await page.getByRole("button", { name: "이전 캔들 더 보기" }).click();
  await expect(page.getByTestId("candle-count")).toHaveText("200개");
  await page.getByRole("button", { name: "이전 캔들 더 보기" }).click();
  await expect(page.getByTestId("candle-count")).toHaveText("201개");
  await expect(page.getByText("마지막 페이지입니다.")).toBeVisible();
  await page.getByRole("button", { name: "1분봉" }).click();
  await expect(page.getByTestId("candle-count")).toHaveText("3개");
  await page.getByRole("button", { name: "일봉" }).click();
  await expect(page.getByTestId("candle-count")).toHaveText("100개");

  await selectByKeyboard(page, "aapl");
  await expectSelected(page, "AAPL", "NASDAQ", "185.70 USD");
  await expect(
    page.getByRole("table", { name: "테스트 유에스 매도 및 매수 호가" }),
  ).toBeVisible();
  const orderbookRows = await page
    .getByRole("table", { name: "테스트 유에스 매도 및 매수 호가" })
    .locator("tbody tr")
    .allTextContents();
  expect(orderbookRows).toEqual([
    expect.stringContaining("185.70 USD"),
    expect.stringContaining("185.75 USD"),
    expect.stringContaining("185.65 USD"),
    expect.stringContaining("185.60 USD"),
  ]);
  const tradeTimes = await page
    .getByRole("table", { name: "테스트 유에스 최근 체결 내역" })
    .locator("tbody time")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("datetime") ?? ""),
    );
  expect(tradeTimes).toEqual(
    [...tradeTimes].sort((left, right) => Date.parse(right) - Date.parse(left)),
  );
  await expect(page.getByTestId("candle-count")).toHaveText("1개");
  await expect(page.getByText("정규장 운영 중")).toBeVisible();
  await expect(
    page.getByText("Asia/Seoul · 현지 기준일 America/New_York"),
  ).toBeVisible();
  await expect(page.getByText("USD/KRW")).toBeVisible();
  await expect(page.getByTestId("exchange-rate")).toHaveText(
    "1,375.123456789012345678 KRW",
  );
  await expect(page.getByText("72,100 KRW")).toHaveCount(0);

  await selectByKeyboard(page, "fwd1");
  await expectSelected(
    page,
    "FWD1",
    "FUTURE_MARKET",
    "9,007,199,254,740,993.123456789 XTS",
  );
  await expect(
    page.getByText("확인되지 않은 유형의 종목 유의사항이 있습니다."),
  ).toBeVisible();
  await expect(page.getByText("FUTURE_WARNING")).toHaveCount(0);
  await expect(page.getByText("체결 내역이 없습니다.")).toBeVisible();

  const search = page.getByRole("combobox");
  await search.fill("missing");
  await expect(
    page.getByText("일치하는 종목이 없습니다. 다른 검색어를 입력해 주세요."),
  ).toBeVisible();
  await expect(page.getByTestId("last-price")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "호가" })).toHaveCount(0);

  await selectByKeyboard(page, "empty1");
  await expect(page.getByText("현재가가 없습니다.")).toBeVisible();
  await expect(page.getByText("호가가 비어 있습니다.")).toBeVisible();
  await expect(page.getByText("캔들 데이터가 없습니다.")).toBeVisible();

  await selectByKeyboard(page, "err1");
  await expect(page.getByText("호가를 불러오지 못했습니다.")).toBeVisible();
  await expect(
    page.getByText("체결 내역을 불러오지 못했습니다."),
  ).toBeVisible();
  await expect(
    page.getByText("캔들 데이터를 불러오지 못했습니다."),
  ).toBeVisible();
  const safeErrorView = await page.locator("body").innerText();
  expect(safeErrorView).not.toMatch(
    /internal-error|mock-(warning|orderbook|trades|candle)-request|stack trace|passwordHash|tokenHash|[A-Z]:\\|\.sqlite3/i,
  );

  await selectByKeyboard(page, "aapl");
  await page.getByRole("button", { name: "선택 종목 추가" }).click();
  await expect(page.getByText("AAPL을 관심종목에 추가했습니다.")).toBeVisible();
  await expect(page.getByRole("button", { name: "추가됨" })).toBeDisabled();

  const watchlistsResponse = await context.request.get("/api/v1/watchlists");
  expect(watchlistsResponse.status()).toBe(200);
  const watchlistsBody = await watchlistsResponse.json();
  const watchlistId = watchlistsBody.data.watchlists[0].id as string;
  const duplicateResponse = await context.request.post(
    `/api/v1/watchlists/${watchlistId}/items`,
    {
      data: { symbol: "AAPL", marketCountry: "US" },
      headers: authHeaders(),
    },
  );
  expect(duplicateResponse.status()).toBe(409);

  await page.reload();
  await expect(page.getByRole("list", { name: "기본 관심종목" })).toContainText(
    "AAPL",
  );
  await page.getByRole("button", { name: /AAPL.*종목 선택/ }).click();
  await expectSelected(page, "AAPL", "NASDAQ", "185.70 USD");
  await page.getByRole("button", { name: "AAPL 관심종목 제거" }).click();
  await expect(
    page.getByText("AAPL을 관심종목에서 제거했습니다."),
  ).toBeVisible();
  await expect(
    page.getByText(
      "저장된 관심종목이 없습니다. 시장 종목을 선택해 추가하세요.",
    ),
  ).toBeVisible();

  await expect(
    page.getByRole("button", { name: /매수|매도|정정|취소|주문/ }),
  ).toHaveCount(0);
  await expect(page.getByRole("form")).toHaveCount(0);

  const logoutResponse = await context.request.post("/api/v1/auth/logout", {
    data: {},
    headers: authHeaders(),
  });
  expect(logoutResponse.status()).toBe(204);
  await page.goto("/market");
  await expect(page).toHaveURL(/\/login\?next=%2Fmarket$/);

  expect(externalRequests).toEqual([]);
  expect(consoleErrors).toEqual([]);
  expect(pageErrors).toEqual([]);
});
