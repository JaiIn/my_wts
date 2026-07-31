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
import { ConditionalOrderDetailScreen } from "../../src/ui/orders/conditional-order-detail-screen";
import { ConditionalOrderHistoryScreen } from "../../src/ui/orders/conditional-order-history-screen";

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
  accountRef: "acct_conditional_component_reference",
  maskedAccountNo: "*******1234",
  accountType: "BROKERAGE",
  selected: true,
};

function conditionalOrder(id: string, type = "SINGLE", status = "WATCHING") {
  return {
    conditionalOrderId: id,
    type: { code: type, kind: type, label: type },
    status: { code: status, kind: status, label: status },
    symbol: "TSTX",
    market: "US",
    quantity: "10.000001",
    orderType: "LIMIT",
    first: {
      type: { code: "STOP", kind: "STOP", label: "가격 조건" },
      status: { code: "WATCHING", kind: "WATCHING", label: "감시 중" },
      triggerPrice: "100.0001",
      targetProfitRate: null,
      orderPrice: "99.0001",
      triggeredOrderId: null,
    },
    createdAt: "2026-02-01T09:00:00+09:00",
  };
}

function history() {
  return render(
    <MarketQueryProvider>
      <ConditionalOrderHistoryScreen />
    </MarketQueryProvider>,
  );
}

function detail(orderId = "conditional-one") {
  return render(
    <MarketQueryProvider>
      <ConditionalOrderDetailScreen conditionalOrderId={orderId} />
    </MarketQueryProvider>,
  );
}

describe("conditional order readonly screens", () => {
  it("keeps an existing account explicitly unselected and skips history", async () => {
    const fetch = vi.fn(async () =>
      json({ data: { accounts: [{ ...account, selected: false }] } }),
    );
    vi.stubGlobal("fetch", fetch);
    history();
    expect(await screen.findByText("선택된 계좌가 없습니다.")).toBeTruthy();
    expect(
      screen.getByRole("link", { name: "설정에서 계좌 선택" }),
    ).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("switches OPEN/CLOSED, filters, and paginates both groups", async () => {
    const calls: string[] = [];
    const fetch = vi.fn(async (url: string) => {
      calls.push(url);
      if (url === "/api/v1/accounts") {
        return json({ data: { accounts: [account] } });
      }
      const parsed = new URL(url, "http://127.0.0.1:3000");
      if (parsed.searchParams.has("cursor")) {
        return json({
          data: {
            conditionalOrders: [conditionalOrder("page-two", "OTO")],
            nextCursor: null,
            hasNext: false,
          },
        });
      }
      return json({
        data: {
          conditionalOrders: [conditionalOrder("page-one", "OCO")],
          nextCursor: "opaque_cursor",
          hasNext: true,
        },
      });
    });
    vi.stubGlobal("fetch", fetch);
    history();
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByRole("button", { name: "더 보기" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "더 보기" }));
    await waitFor(() =>
      expect(calls.some((url) => url.includes("cursor=opaque_cursor"))).toBe(
        true,
      ),
    );
    expect(
      document.querySelector('a[href="/conditional-orders/page-two"]'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("tab", { name: "CLOSED" }));
    await waitFor(() =>
      expect(calls.some((url) => url.includes("status=CLOSED"))).toBe(true),
    );
    fireEvent.change(screen.getByLabelText("종목 코드"), {
      target: { value: "aapl" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회 조건 적용" }));
    await waitFor(() =>
      expect(calls.some((url) => url.includes("symbol=AAPL"))).toBe(true),
    );
  });

  it("rejects invalid symbol before another request", async () => {
    const fetch = vi.fn(async (url: string) =>
      url === "/api/v1/accounts"
        ? json({ data: { accounts: [account] } })
        : json({
            data: {
              conditionalOrders: [],
              nextCursor: null,
              hasNext: false,
            },
          }),
    );
    vi.stubGlobal("fetch", fetch);
    history();
    await screen.findByText("조건에 맞는 조건주문 내역이 없습니다.");
    const before = fetch.mock.calls.length;
    fireEvent.change(screen.getByLabelText("종목 코드"), {
      target: { value: "../bad" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회 조건 적용" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(before);
  });

  it.each(["SINGLE", "OCO", "OTO"])(
    "renders %s detail with first/optional second legs",
    async (type) => {
      const value = {
        ...conditionalOrder("conditional-one", type),
        expireDate: type === "SINGLE" ? undefined : "2026-12-31",
        second:
          type === "SINGLE"
            ? null
            : {
                type: {
                  code: "PROFIT_RATE",
                  kind: "PROFIT_RATE",
                  label: "수익률 조건",
                },
                status: {
                  code: "HOLDING",
                  kind: "HOLDING",
                  label: "대기 중",
                },
                triggerPrice: null,
                targetProfitRate: "10.500001",
                orderPrice: null,
                triggeredOrderId: "fixture-order-3",
              },
      };
      vi.stubGlobal(
        "fetch",
        vi.fn(async (url: string) =>
          url === "/api/v1/accounts"
            ? json({ data: { accounts: [account] } })
            : json({ data: value }),
        ),
      );
      detail();
      expect(await screen.findByText(`${type} · ${type}`)).toBeTruthy();
      expect(screen.getByText("첫 번째 조건")).toBeTruthy();
      if (type === "SINGLE") {
        expect(screen.queryByText("두 번째 조건")).toBeNull();
        expect(screen.getAllByText("미제공").length).toBeGreaterThan(0);
      } else {
        expect(screen.getByText("두 번째 조건")).toBeTruthy();
        expect(
          screen
            .getByRole("link", { name: "일반 주문 상세 보기" })
            .getAttribute("href"),
        ).toBe("/orders/fixture-order-3");
      }
    },
  );

  it("renders unknown/nullable values and safe errors without action UI", async () => {
    const value = {
      ...conditionalOrder(
        "conditional-unknown",
        "FUTURE_TYPE",
        "FUTURE_STATUS",
      ),
      type: {
        code: "FUTURE_TYPE",
        kind: "UNKNOWN",
        label: "알 수 없는 값",
      },
      status: {
        code: "FUTURE_STATUS",
        kind: "UNKNOWN",
        label: "알 수 없는 값",
      },
      first: {
        type: {
          code: "FUTURE_CONDITION",
          kind: "UNKNOWN",
          label: "알 수 없는 값",
        },
        status: {
          code: "FUTURE_LEG",
          kind: "UNKNOWN",
          label: "알 수 없는 값",
        },
        triggerPrice: null,
        targetProfitRate: null,
        orderPrice: null,
        triggeredOrderId: null,
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/v1/accounts"
          ? json({ data: { accounts: [account] } })
          : json({ data: value }),
      ),
    );
    detail("conditional-unknown");
    expect(await screen.findAllByText(/알 수 없는 값/)).not.toHaveLength(0);
    expect(screen.getAllByText("미제공").length).toBeGreaterThan(0);
    expect(
      screen.queryByRole("button", {
        name: /등록|수정|취소|활성화|중지|재시작|실행|제출/,
      }),
    ).toBeNull();
    expect(document.body.textContent).toContain("조회 전용");
  });

  it("shows a generic safe detail error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url === "/api/v1/accounts"
          ? json({ data: { accounts: [account] } })
          : json(
              {
                error: {
                  requestId: "safe",
                  code: "UPSTREAM_NOT_FOUND",
                  retryable: false,
                  details: {},
                },
              },
              404,
            ),
      ),
    );
    detail("missing-conditional");
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/stack|sqlite|raw payload/i);
  });
});
