// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderInfoPanel } from "../../src/ui/account/order-info-panel";
import { MarketQueryProvider } from "../../src/ui/market/market-query-provider";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function response(data: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data, meta: { requestId: "order-info-component" } }
        : {
            error: {
              code: "UPSTREAM_UNAVAILABLE",
              retryable: false,
              requestId: "safe",
            },
          },
    ),
    { status, headers: { "Content-Type": "application/json" } },
  );
}

function renderPanel(selectedAccountRef?: string) {
  return render(
    <MarketQueryProvider>
      <OrderInfoPanel selectedAccountRef={selectedAccountRef} />
    </MarketQueryProvider>,
  );
}

describe("order information panel", () => {
  it("does not query or render without an explicit account selection", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    renderPanel();
    expect(fetch).not.toHaveBeenCalled();
    expect(screen.queryByText("주문 전 조회 정보")).toBeNull();
  });

  it("shows readonly values and waits for an explicit symbol lookup", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url.includes("buying-power")) {
        return response({
          currency: "KRW",
          cashBuyingPower: "9007199254740993",
        });
      }
      if (url.includes("commissions")) {
        return response([
          {
            marketCountry: "KR",
            commissionRate: "0.015",
            startDate: null,
            endDate: null,
          },
        ]);
      }
      return response({ symbol: "AAPL", sellableQuantity: "5.500000000000000001" });
    });
    vi.stubGlobal("fetch", fetch);
    renderPanel("acct_component_order_info");
    expect(await screen.findByText(/9007199254740993/)).toBeTruthy();
    expect(screen.getByText("조회할 종목 코드를 입력해 주세요.")).toBeTruthy();
    expect(fetch.mock.calls.some(([url]) => String(url).includes("sellable"))).toBe(false);
    fireEvent.change(screen.getByLabelText("종목 코드"), {
      target: { value: "aapl" },
    });
    fireEvent.click(screen.getByRole("button", { name: "조회" }));
    expect(await screen.findByText(/5.500000000000000001/)).toBeTruthy();
    expect(screen.getByText(/실제 주문 기능은 없습니다/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /매수|매도|주문 제출/ })).toBeNull();
  });

  it("preserves zero and renders safe independent errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.includes("buying-power")
          ? response({ currency: "KRW", cashBuyingPower: "0" })
          : response(null, 503),
      ),
    );
    renderPanel("acct_component_order_info");
    expect(await screen.findByText(/0 KRW/)).toBeTruthy();
    expect((await screen.findAllByRole("alert")).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/stack|sqlite|accountSeq|accountNo/i);
  });
});
