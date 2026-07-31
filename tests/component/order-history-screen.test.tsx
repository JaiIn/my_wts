// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MarketQueryProvider } from "../../src/ui/market/market-query-provider";
import { OrderDetailScreen } from "../../src/ui/orders/order-detail-screen";
import { OrderHistoryScreen } from "../../src/ui/orders/order-history-screen";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

const account = {
  accountRef: "acct_order_component_reference",
  maskedAccountNo: "*******1234",
  accountType: "BROKERAGE",
  selected: true,
};

const partialOrder = {
  orderId: "fixture-order-3",
  symbol: "TSTX",
  side: "SELL",
  orderType: "LIMIT",
  timeInForce: "DAY",
  status: {
    code: "PARTIAL_FILLED",
    kind: "PARTIAL_FILLED",
    label: "부분 체결",
  },
  price: "12345.6789",
  quantity: "10.000001",
  orderAmount: null,
  currency: "USD",
  orderedAt: "2026-01-04T09:30:00+09:00",
  canceledAt: null,
  execution: {
    filledQuantity: "2.500001",
    averageFilledPrice: "12345.6001",
    filledAmount: "30864.012345",
    commission: "0",
    tax: null,
    filledAt: "2026-01-04T09:31:00+09:00",
    settlementDate: null,
  },
};

function renderHistory() {
  return render(
    <MarketQueryProvider>
      <OrderHistoryScreen />
    </MarketQueryProvider>,
  );
}

function renderDetail(orderId = partialOrder.orderId) {
  return render(
    <MarketQueryProvider>
      <OrderDetailScreen orderId={orderId} />
    </MarketQueryProvider>,
  );
}

describe("readonly order history screens", () => {
  it("does not query orders or auto-select without a selected account", async () => {
    const fetch = vi.fn(async () =>
      json({ data: { accounts: [{ ...account, selected: false }] } }),
    );
    vi.stubGlobal("fetch", fetch);
    renderHistory();
    expect(await screen.findByText("선택된 계좌가 없습니다.")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole("link", { name: "설정에서 계좌 선택" }),
    ).toBeTruthy();
  });

  it("renders OPEN, switches to CLOSED, filters, and paginates only CLOSED", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === "/api/v1/accounts") {
        return json({ data: { accounts: [account] } });
      }
      const parsed = new URL(url, "http://127.0.0.1:3000");
      if (parsed.searchParams.get("status") === "OPEN") {
        return json({
          data: { orders: [partialOrder], nextCursor: null, hasNext: false },
        });
      }
      if (parsed.searchParams.has("cursor")) {
        return json({
          data: {
            orders: [{ ...partialOrder, orderId: "closed-page-2" }],
            nextCursor: null,
            hasNext: false,
          },
        });
      }
      return json({
        data: {
          orders: [{ ...partialOrder, orderId: "closed-page-1" }],
          nextCursor: "opaque+cursor=",
          hasNext: true,
        },
      });
    });
    vi.stubGlobal("fetch", fetch);
    renderHistory();

    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "더 보기" })).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "CLOSED" }));
    expect(await screen.findByRole("button", { name: "더 보기" })).toBeTruthy();

    fireEvent.change(screen.getByLabelText("종목 코드"), {
      target: { value: "aapl" },
    });
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-01-01" },
    });
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-01-31" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회 조건 적용" }));
    await waitFor(() =>
      expect(
        calls.some(
          (url) =>
            url.includes("status=CLOSED") &&
            url.includes("symbol=AAPL") &&
            url.includes("from=2026-01-01") &&
            url.includes("to=2026-01-31"),
        ),
      ).toBe(true),
    );

    fireEvent.click(await screen.findByRole("button", { name: "더 보기" }));
    await waitFor(() =>
      expect(
        calls.some((url) => url.includes("cursor=opaque%2Bcursor%3D")),
      ).toBe(true),
    );
    expect(
      document.querySelector('a[href="/orders/closed-page-2"]'),
    ).toBeTruthy();
  });

  it("rejects invalid client date ranges without another BFF call", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/v1/accounts") {
        return json({ data: { accounts: [account] } });
      }
      return json({
        data: { orders: [], nextCursor: null, hasNext: false },
      });
    });
    vi.stubGlobal("fetch", fetch);
    renderHistory();
    await screen.findByText("조건에 맞는 주문 내역이 없습니다.");
    const before = fetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText("시작일"), {
      target: { value: "2026-02-02" },
    });
    fireEvent.change(screen.getByLabelText("종료일"), {
      target: { value: "2026-02-01" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회 조건 적용" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "조회 조건을 확인해 주세요.",
    );
    expect(fetch).toHaveBeenCalledTimes(before);
  });

  it("renders partial execution, nullable values, timeline, and readonly notice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/v1/accounts"
          ? json({ data: { accounts: [account] } })
          : json({ data: partialOrder }),
      ),
    );
    renderDetail();
    expect(await screen.findByText("2.500001")).toBeTruthy();
    expect(screen.getByText("부분 체결 · PARTIAL_FILLED")).toBeTruthy();
    expect(screen.getByText("체결 기록")).toBeTruthy();
    expect(screen.getAllByText("미제공").length).toBeGreaterThan(0);
    expect(screen.getByText(/다른 채널에서 생성된 주문도 표시/)).toBeTruthy();
    expect(
      screen.queryByRole("button", {
        name: /주문|매수|매도|정정|취소|재주문|전송/,
      }),
    ).toBeNull();
  });

  it.each(["CANCELED", "REJECTED"] as const)(
    "preserves partial execution for %s detail",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url === "/api/v1/accounts"
            ? json({ data: { accounts: [account] } })
            : json({
                data: {
                  ...partialOrder,
                  orderId: `fixture-${status.toLowerCase()}`,
                  status: { code: status, kind: status, label: status },
                },
              }),
        ),
      );
      renderDetail(`fixture-${status.toLowerCase()}`);
      expect(await screen.findByText("2.500001")).toBeTruthy();
      expect(screen.getByText(`${status} · ${status}`)).toBeTruthy();
    },
  );

  it("shows a safe detail error without raw payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/v1/accounts"
          ? json({ data: { accounts: [account] } })
          : json(
              {
                error: {
                  code: "UPSTREAM_NOT_FOUND",
                  requestId: "safe",
                  retryable: false,
                  details: {},
                },
              },
              404,
            ),
      ),
    );
    renderDetail("missing-order");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/stack|sqlite|raw payload/i);
  });
});
