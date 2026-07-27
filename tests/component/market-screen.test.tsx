// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import MarketPage from "../../app/(dashboard)/market/page";
import { MarketScreen } from "../../src/ui/market/market-screen";

afterEach(() => {
  cleanup();
});

async function renderMarketPage() {
  render(await MarketPage());
}

describe("market screen", () => {
  it("renders /market with the frozen initial stock and mock disclosure", async () => {
    await renderMarketPage();

    expect(screen.getByRole("heading", { name: "시장 홈" })).toBeTruthy();
    expect(screen.getByText("005930 · KOSPI")).toBeTruthy();
    expect(screen.getByTestId("last-price").textContent).toBe("72,000 KRW");
    expect(screen.getByText("실시간 시세 아님")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "종목 유의사항" })).toBeTruthy();
    expect(screen.getByText("정적 변동성 완화장치 발동")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "호가" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "최근 체결" })).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "테스트 코리아 매도 및 매수 호가" }),
    ).toBeTruthy();
    expect(
      screen.getByRole("table", { name: "테스트 코리아 최근 체결 내역" }),
    ).toBeTruthy();
  });

  it("supports accessible symbol search and keyboard selection", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox", {
      name: "종목 코드, 종목명 또는 시장",
    });

    fireEvent.change(search, { target: { value: "aapl" } });
    const listbox = screen.getByRole("listbox", { name: "종목 검색 결과" });
    expect(within(listbox).getAllByRole("option")).toHaveLength(1);
    expect(search.getAttribute("aria-expanded")).toBe("true");

    fireEvent.keyDown(search, { key: "ArrowDown" });
    expect(search.getAttribute("aria-activedescendant")).toBeTruthy();
    fireEvent.keyDown(search, { key: "Enter" });

    expect(screen.getByText("AAPL · NASDAQ")).toBeTruthy();
    expect(screen.getByTestId("last-price").textContent).toBe("185.70 USD");
    expect(screen.queryByRole("heading", { name: "종목 유의사항" })).toBeNull();
    expect(
      screen.getByRole("table", { name: "테스트 유에스 매도 및 매수 호가" })
        .textContent,
    ).toContain("185.70 USD");
    expect(
      screen.getByRole("table", { name: "테스트 유에스 최근 체결 내역" })
        .textContent,
    ).toContain("185.70 USD");
    expect(document.body.textContent).not.toContain("72,100 KRW");
  });

  it("searches Korean names after trimming whitespace", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "  유에스  " } });

    expect(screen.getByRole("option").textContent?.includes("AAPL")).toBe(true);
  });

  it("preserves unknown markets and large decimal text after selection", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "fwd1" } });
    fireEvent.click(screen.getByRole("option"));

    expect(screen.getByText("FWD1 · FUTURE_MARKET")).toBeTruthy();
    expect(screen.getByTestId("last-price").textContent).toBe(
      "9,007,199,254,740,993.123456789 XTS",
    );
    expect(screen.getByText("제공되지 않음")).toBeTruthy();
  });

  it("shows only the minimal no-result state and no unsupported quote fields", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");
    fireEvent.change(search, {
      target: { value: "missing" },
    });

    expect(screen.getByRole("status").textContent).toBe(
      "일치하는 종목이 없습니다. 다른 검색어를 입력해 주세요.",
    );
    expect(screen.queryByTestId("last-price")).toBeNull();
    expect(screen.queryByRole("heading", { name: "종목 유의사항" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "호가" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "최근 체결" })).toBeNull();
    expect(screen.queryByText("등락")).toBeNull();
    expect(screen.queryByText("등락률")).toBeNull();
    expect(screen.queryByText("거래량")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByTestId("last-price").textContent).toBe("185.70 USD");
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("does not render authentication or database internals into the client view", async () => {
    await renderMarketPage();
    const html = document.body.innerHTML;

    expect(html).not.toContain("my_wts_session");
    expect(html).not.toContain("passwordHash");
    expect(html).not.toContain("sessionTokenHash");
    expect(html).not.toContain("accountSeq");
  });

  it("shows the minimum-length status without stale price or warnings", async () => {
    await renderMarketPage();
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "a" },
    });

    expect(screen.getByRole("status").textContent).toBe(
      "검색하려면 2자 이상 입력해 주세요.",
    );
    expect(screen.queryByTestId("last-price")).toBeNull();
    expect(screen.queryByText("단기과열종목")).toBeNull();
  });

  it("shows unknown warnings safely and removes stale warnings across selection", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "fwd1" } });
    fireEvent.click(screen.getByRole("option"));

    expect(screen.getByText("종목 유의사항", { selector: "h3" })).toBeTruthy();
    expect(
      screen.getByText("확인되지 않은 유형의 종목 유의사항이 있습니다."),
    ).toBeTruthy();
    expect(screen.queryByText("FUTURE_WARNING")).toBeNull();
    expect(screen.queryByText("단기과열종목")).toBeNull();

    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.queryByRole("heading", { name: "종목 유의사항" })).toBeNull();
  });

  it("shows missing-price and safe warning-error states without stale data", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "empty1" } });
    fireEvent.click(screen.getByRole("option"));
    expect(
      screen.getAllByRole("status").some(({ textContent }) =>
        textContent?.includes("현재가가 없습니다."),
      ),
    ).toBe(true);
    expect(screen.getAllByRole("status").some(({ textContent }) =>
      textContent?.includes("호가가 비어 있습니다."),
    )).toBe(true);
    expect(
      screen.getByRole("table", { name: "가격 미제공 테스트 최근 체결 내역" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("last-price")).toBeNull();

    fireEvent.change(search, { target: { value: "err1" } });
    fireEvent.click(screen.getByRole("option"));
    expect(
      screen.getAllByRole("alert").some(({ textContent }) =>
        textContent?.includes("종목 유의사항을 불러오지 못했습니다."),
      ),
    ).toBe(true);
    expect(screen.getByTestId("last-price").textContent).toBe("123.45 XTS");
    expect(document.body.textContent).not.toContain("internal-error");
    expect(document.body.textContent).not.toContain("mock-warning-request");
    expect(document.body.textContent).not.toContain(
      "Mock warning lookup failed.",
    );
    expect(document.body.textContent).toContain(
      "호가를 불러오지 못했습니다.",
    );
    expect(document.body.textContent).toContain(
      "체결 내역을 불러오지 못했습니다.",
    );
    expect(document.body.textContent).not.toContain(
      "Mock orderbook lookup failed.",
    );
    expect(document.body.textContent).not.toContain(
      "Mock trades lookup failed.",
    );

    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByTestId("last-price").textContent).toBe("185.70 USD");
    expect(screen.queryByText("호가를 불러오지 못했습니다.")).toBeNull();
    expect(screen.queryByText("체결 내역을 불러오지 못했습니다.")).toBeNull();
  });

  it("shows independent orderbook and trade empty states without stale rows", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "fwd1" } });
    fireEvent.click(screen.getByRole("option"));

    expect(
      screen.getByRole("table", {
        name: "미래 계약 테스트 매도 및 매수 호가",
      }).textContent,
    ).toContain("9,007,199,254,740,993.223456789 XTS");
    expect(
      screen.getAllByRole("status").some(({ textContent }) =>
        textContent?.includes("체결 내역이 없습니다."),
      ),
    ).toBe(true);
    expect(document.body.textContent).not.toContain("72,100 KRW");

    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));

    expect(
      screen.getByRole("table", { name: "테스트 유에스 최근 체결 내역" }),
    ).toBeTruthy();
    expect(screen.queryByText("체결 내역이 없습니다.")).toBeNull();
    expect(document.body.textContent).not.toContain(
      "9,007,199,254,740,993.223456789 XTS",
    );
  });

  it("uses accessible widget tables and text labels without order actions", async () => {
    await renderMarketPage();
    const orderbook = screen.getByRole("table", {
      name: "테스트 코리아 매도 및 매수 호가",
    });
    const trades = screen.getByRole("table", {
      name: "테스트 코리아 최근 체결 내역",
    });

    expect(within(orderbook).getAllByRole("columnheader")).toHaveLength(3);
    expect(
      within(orderbook).getAllByRole("rowheader", { name: "매도 호가" }),
    ).toHaveLength(3);
    expect(
      within(orderbook).getAllByRole("rowheader", { name: "매수 호가" }),
    ).toHaveLength(3);
    expect(within(trades).getAllByRole("columnheader")).toHaveLength(3);
    expect(screen.queryByRole("button", { name: /매수|매도|주문/ })).toBeNull();
    expect(screen.queryByRole("form")).toBeNull();
  });

  it("renders the empty stock-list state without search or stale cards", () => {
    render(
      <MarketScreen
        initialSymbol=""
        stocks={[]}
        prices={[]}
        warnings={[]}
        orderbooks={[]}
        trades={[]}
        priceErrors={[]}
        warningErrors={[]}
        orderbookErrors={[]}
        tradeErrors={[]}
      />,
    );

    expect(screen.getByRole("status").textContent).toContain(
      "표시할 종목이 없습니다.",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByTestId("last-price")).toBeNull();
  });
});
