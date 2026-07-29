// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { loadMarketScreen } from "../../src/application/market/market-screen";
import type { Watchlist } from "../../src/domain/watchlist/watchlist";
import { createMockMarketService } from "../../src/infrastructure/market/mock-market-service";
import { MarketScreen } from "../../src/ui/market/market-screen";
import { MarketQueryProvider } from "../../src/ui/market/market-query-provider";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

async function renderMarketPage() {
  const data = await loadMarketScreen(createMockMarketService());
  render(<MarketScreen {...data} />, { wrapper: MarketQueryProvider });
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
    expect(screen.getByRole("heading", { name: "캔들 차트" })).toBeTruthy();
    expect(screen.getByTestId("candle-count").textContent).toBe("100개");
    expect(
      screen.getByRole("table", {
        name: "테스트 코리아 1d 캔들 원본 데이터",
      }),
    ).toBeTruthy();
    expect(screen.getByLabelText("캔들 방향 범례").textContent).toContain(
      "상승: 종가가 시가보다 높음",
    );
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
    expect(screen.queryByRole("heading", { name: "캔들 차트" })).toBeNull();
    expect(screen.queryByText("등락")).toBeNull();
    expect(screen.queryByText("등락률")).toBeNull();
    expect(screen.queryByText("거래량")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();

    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByTestId("last-price").textContent).toBe("185.70 USD");
    expect(
      screen.queryByText(
        "일치하는 종목이 없습니다. 다른 검색어를 입력해 주세요.",
      ),
    ).toBeNull();
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
      screen
        .getAllByRole("status")
        .some(({ textContent }) => textContent?.includes("현재가가 없습니다.")),
    ).toBe(true);
    expect(
      screen
        .getAllByRole("status")
        .some(({ textContent }) =>
          textContent?.includes("호가가 비어 있습니다."),
        ),
    ).toBe(true);
    expect(
      screen.getByRole("table", { name: "가격 미제공 테스트 최근 체결 내역" }),
    ).toBeTruthy();
    expect(screen.queryByTestId("last-price")).toBeNull();

    fireEvent.change(search, { target: { value: "err1" } });
    fireEvent.click(screen.getByRole("option"));
    expect(
      screen
        .getAllByRole("alert")
        .some(({ textContent }) =>
          textContent?.includes("종목 유의사항을 불러오지 못했습니다."),
        ),
    ).toBe(true);
    expect(screen.getByTestId("last-price").textContent).toBe("123.45 XTS");
    expect(document.body.textContent).not.toContain("internal-error");
    expect(document.body.textContent).not.toContain("mock-warning-request");
    expect(document.body.textContent).not.toContain(
      "Mock warning lookup failed.",
    );
    expect(document.body.textContent).toContain("호가를 불러오지 못했습니다.");
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
      screen
        .getAllByRole("status")
        .some(({ textContent }) =>
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

  it("pages deterministically through first, middle, and last candle pages", async () => {
    await renderMarketPage();

    expect(screen.getByTestId("candle-count").textContent).toBe("100개");
    fireEvent.click(screen.getByRole("button", { name: "이전 캔들 더 보기" }));
    expect(screen.getByTestId("candle-count").textContent).toBe("200개");
    fireEvent.click(screen.getByRole("button", { name: "이전 캔들 더 보기" }));
    expect(screen.getByTestId("candle-count").textContent).toBe("201개");
    expect(screen.getByText("마지막 페이지입니다.")).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "이전 캔들 더 보기" }),
    ).toBeNull();
    expect(
      screen
        .getByRole("table", {
          name: "테스트 코리아 1d 캔들 원본 데이터",
        })
        .querySelectorAll("tbody tr"),
    ).toHaveLength(201);
  });

  it("handles duplicate page clicks with bounded functional updates", async () => {
    await renderMarketPage();
    const loadMore = screen.getByRole("button", {
      name: "이전 캔들 더 보기",
    });

    fireEvent.click(loadMore);
    fireEvent.click(loadMore);

    expect(screen.getByTestId("candle-count").textContent).toBe("201개");
    expect(screen.getByText("마지막 페이지입니다.")).toBeTruthy();
  });

  it("resets candle pagination on interval and symbol changes", async () => {
    await renderMarketPage();
    const loadMore = screen.getByRole("button", {
      name: "이전 캔들 더 보기",
    });
    fireEvent.click(loadMore);
    expect(screen.getByTestId("candle-count").textContent).toBe("200개");

    fireEvent.click(screen.getByRole("button", { name: "1분봉" }));
    expect(screen.getByTestId("candle-count").textContent).toBe("3개");
    expect(
      screen
        .getByRole("button", { name: "1분봉" })
        .getAttribute("aria-pressed"),
    ).toBe("true");

    fireEvent.click(screen.getByRole("button", { name: "일봉" }));
    expect(screen.getByTestId("candle-count").textContent).toBe("100개");

    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByTestId("candle-count").textContent).toBe("1개");
    expect(screen.getByText("보합: 종가와 시가가 같음")).toBeTruthy();

    fireEvent.change(search, { target: { value: "005930" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByTestId("candle-count").textContent).toBe("100개");
  });

  it("preserves large candle decimals and shows independent empty states", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "fwd1" } });
    fireEvent.click(screen.getByRole("option"));

    const table = screen.getByRole("table", {
      name: "미래 계약 테스트 1d 캔들 원본 데이터",
    });
    expect(table.textContent).toContain("9,007,199,254,740,993.123456780 XTS");
    expect(table.textContent).toContain("90,071,992,547,409,931,234,567,890");

    fireEvent.click(screen.getByRole("button", { name: "1분봉" }));
    expect(screen.getByText("캔들 데이터가 없습니다.")).toBeTruthy();
    expect(screen.queryByTestId("candle-count")).toBeNull();

    fireEvent.change(search, { target: { value: "empty1" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByText("캔들 데이터가 없습니다.")).toBeTruthy();
  });

  it("shows safe candle errors without replacing other widgets", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "err1" } });
    fireEvent.click(screen.getByRole("option"));

    expect(screen.getByText("캔들 데이터를 불러오지 못했습니다.")).toBeTruthy();
    expect(screen.getByTestId("last-price").textContent).toBe("123.45 XTS");
    expect(document.body.textContent).toContain("호가를 불러오지 못했습니다.");
    expect(document.body.textContent).not.toContain(
      "Mock candle lookup failed.",
    );
    expect(document.body.textContent).not.toContain("mock-candle-request");
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
        candleSeries={[]}
        priceErrors={[]}
        warningErrors={[]}
        orderbookErrors={[]}
        tradeErrors={[]}
        candleErrors={[]}
      />,
      { wrapper: MarketQueryProvider },
    );

    expect(screen.getByRole("status").textContent).toContain(
      "표시할 종목이 없습니다.",
    );
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByTestId("last-price")).toBeNull();
  });

  it("shows deterministic calendar data and only needed currency conversion", async () => {
    await renderMarketPage();

    expect(screen.getByRole("heading", { name: "장 운영 상태" })).toBeTruthy();
    expect(screen.getByText("Asia/Seoul")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "참고 환율" })).toBeNull();

    const search = screen.getByRole("combobox");
    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));

    expect(screen.getByText("정규장 운영 중")).toBeTruthy();
    expect(
      screen.getByText("Asia/Seoul · 현지 기준일 America/New_York"),
    ).toBeTruthy();
    expect(screen.getByRole("list", { name: "장 세션" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "참고 환율" })).toBeTruthy();
    expect(screen.getByTestId("exchange-rate").textContent).toBe(
      "1,375.123456789012345678 KRW",
    );
    expect(screen.getByText("USD/KRW")).toBeTruthy();
    expect(document.body.textContent).toContain("고정 mock");
    expect(document.body.textContent).toContain("비실시간");
  });

  it("clears stale calendar and exchange-rate data for unknown and no-result states", async () => {
    await renderMarketPage();
    const search = screen.getByRole("combobox");

    fireEvent.change(search, { target: { value: "aapl" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.getByTestId("exchange-rate")).toBeTruthy();

    fireEvent.change(search, { target: { value: "fwd1" } });
    fireEvent.click(screen.getByRole("option"));
    expect(screen.queryByTestId("exchange-rate")).toBeNull();
    expect(document.body.textContent).not.toContain("1,375.123456789012345678");
    expect(document.body.textContent).toContain(
      "장 운영 정보를 제공하지 않는 시장입니다.",
    );
    expect(document.body.textContent).toContain(
      "환율 정보를 제공하지 않는 통화입니다.",
    );

    fireEvent.change(search, { target: { value: "missing" } });
    expect(screen.queryByRole("heading", { name: "장 운영 상태" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "참고 환율" })).toBeNull();
  });

  it("adds the selected stock and preserves the list on conflict or error", async () => {
    const data = await loadMarketScreen(createMockMarketService());
    const emptyList: Watchlist = {
      id: "00000000-0000-4000-8000-000000000021",
      name: "기본 관심종목",
      sortOrder: 0,
      isDefault: true,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
      items: [],
    };
    const updated = {
      ...emptyList,
      items: [
        {
          symbol: "005930",
          marketCountry: "KR" as const,
          sortOrder: 0,
          addedAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { watchlist: updated } }), {
          status: 201,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { code: "CONFLICT" } }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketScreen {...data} watchlists={[emptyList]} />, {
      wrapper: MarketQueryProvider,
    });

    fireEvent.click(screen.getByRole("button", { name: "선택 종목 추가" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "추가됨" })).toBeTruthy(),
    );
    expect(screen.getByText("005930", { selector: "span" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/watchlists/${emptyList.id}/items`,
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("selects and removes watchlist items with distinct accessible buttons", async () => {
    const data = await loadMarketScreen(createMockMarketService());
    const list: Watchlist = {
      id: "00000000-0000-4000-8000-000000000022",
      name: "기본 관심종목",
      sortOrder: 0,
      isDefault: true,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
      items: [
        {
          symbol: "AAPL",
          marketCountry: "US",
          sortOrder: 0,
          addedAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<MarketScreen {...data} watchlists={[list]} />, {
      wrapper: MarketQueryProvider,
    });

    fireEvent.click(screen.getByRole("button", { name: /AAPL.*종목 선택/ }));
    expect(screen.getByTestId("last-price").textContent).toBe("185.70 USD");
    expect(screen.getByTestId("exchange-rate")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "AAPL 관심종목 제거" }));
    await waitFor(() =>
      expect(screen.queryByText("AAPL", { selector: "span" })).toBeNull(),
    );
    expect(screen.getByText(/AAPL을 관심종목에서 제거/)).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      `/api/v1/watchlists/${list.id}/items/US/AAPL`,
      { method: "DELETE" },
    );
  });

  it("keeps persisted items visible when a remove request fails", async () => {
    const data = await loadMarketScreen(createMockMarketService());
    const list: Watchlist = {
      id: "00000000-0000-4000-8000-000000000023",
      name: "기본 관심종목",
      sortOrder: 0,
      isDefault: true,
      createdAt: "2026-07-28T00:00:00.000Z",
      updatedAt: "2026-07-28T00:00:00.000Z",
      items: [
        {
          symbol: "AAPL",
          marketCountry: "US",
          sortOrder: 0,
          addedAt: "2026-07-28T00:00:00.000Z",
        },
      ],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(new Response(null, { status: 500 })),
    );
    render(<MarketScreen {...data} watchlists={[list]} />, {
      wrapper: MarketQueryProvider,
    });

    fireEvent.click(screen.getByRole("button", { name: "AAPL 관심종목 제거" }));
    const removalError = await screen.findByText(
      "관심종목을 제거하지 못했습니다. 기존 목록은 유지됩니다.",
    );
    expect(screen.getByText("AAPL", { selector: "span" })).toBeTruthy();
    expect(removalError.getAttribute("role")).toBe("alert");
    expect(removalError.textContent).not.toMatch(/stack|sql|sqlite|token/i);
  });
});
