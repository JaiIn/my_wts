// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PortfolioPanel } from "../../src/ui/account/portfolio-panel";
import { MarketQueryProvider } from "../../src/ui/market/market-query-provider";

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

const holding = {
  symbol: "005930",
  name: "테스트 삼성전자",
  marketCountry: "KR",
  currency: "KRW",
  quantity: "9007199254740993",
  lastPrice: "72000",
  averagePurchasePrice: "65000",
  marketValue: {
    purchaseAmount: "6500000",
    amount: "7200000",
    amountAfterCost: "7050000",
  },
  profitLoss: {
    amount: "700000",
    amountAfterCost: "550000",
    rate: "0.1077",
    rateAfterCost: "0.0846",
  },
  dailyProfitLoss: { amount: "100000", rate: "0.0141" },
};

const holdings = {
  totalPurchaseAmount: { krw: "6500000", usd: null },
  marketValue: {
    amount: { krw: "7200000", usd: null },
    amountAfterCost: { krw: "7050000", usd: null },
  },
  profitLoss: {
    amount: { krw: "700000", usd: null },
    amountAfterCost: { krw: "550000", usd: null },
    rate: "0.1077",
    rateAfterCost: "0.0846",
  },
  dailyProfitLoss: {
    amount: { krw: "100000", usd: null },
    rate: "0.0141",
  },
  items: [holding],
};

function renderPanel() {
  return render(
    <MarketQueryProvider>
      <PortfolioPanel />
    </MarketQueryProvider>,
  );
}

describe("portfolio panel", () => {
  it("does not request holdings or auto-select when unselected", async () => {
    const fetch = vi.fn(async () =>
      json({
        data: {
          accounts: [
            {
              accountRef: "acct_portfolio_component_ref",
              maskedAccountNo: "*******1234",
              accountType: "BROKERAGE",
              selected: false,
            },
          ],
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    renderPanel();
    expect(await screen.findByText("선택된 계좌가 없습니다.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "설정에서 계좌 선택" })).toBeTruthy();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("button", { name: /매수|매도|주문/ })).toBeNull();
  });

  it("renders precise holdings through the same-origin BFF", async () => {
    const fetch = vi.fn(async (url: string) => {
      if (url === "/api/v1/accounts") {
        return json({
            data: {
              accounts: [
                {
                  accountRef: "acct_portfolio_component_ref",
                  maskedAccountNo: "*******1234",
                  accountType: "BROKERAGE",
                  selected: true,
                },
              ],
            },
          });
      }
      if (url === "/api/v1/portfolio/holdings") {
        return json({ data: holdings });
      }
      if (url.includes("buying-power")) {
        return json({ data: { currency: "KRW", cashBuyingPower: "0" } });
      }
      if (url.includes("commissions")) return json({ data: [] });
      return json({ data: { symbol: "AAPL", sellableQuantity: "0" } });
    });
    vi.stubGlobal("fetch", fetch);
    renderPanel();
    expect(await screen.findByRole("table")).toBeTruthy();
    expect(screen.getByText("9007199254740993")).toBeTruthy();
    expect(screen.getByText("테스트 삼성전자")).toBeTruthy();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/portfolio/holdings",
      expect.objectContaining({ method: "GET", credentials: "same-origin" }),
    );
    expect(document.body.textContent).not.toMatch(
      /accountSeq|accountNo|authorization|cookie|주문 수량/i,
    );
  });

  it("distinguishes empty and safe error states", async () => {
    const accountResponse = {
      data: {
        accounts: [
          {
            accountRef: "acct_portfolio_component_ref",
            maskedAccountNo: "*******1234",
            accountType: "BROKERAGE",
            selected: true,
          },
        ],
      },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/v1/accounts") return json(accountResponse);
      if (url === "/api/v1/portfolio/holdings") {
        return json({ data: { ...holdings, items: [] } });
      }
      if (url.includes("buying-power")) {
        return json({ data: { currency: "KRW", cashBuyingPower: "0" } });
      }
      if (url.includes("commissions")) return json({ data: [] });
      return json({ data: { symbol: "AAPL", sellableQuantity: "0" } });
    }));
    const empty = renderPanel();
    expect(await screen.findByText("보유 종목이 없습니다.")).toBeTruthy();
    empty.unmount();

    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      if (url === "/api/v1/accounts") return json(accountResponse);
      if (url === "/api/v1/portfolio/holdings") {
        return json(
            {
              error: {
                code: "UPSTREAM_UNAVAILABLE",
                retryable: false,
                requestId: "safe",
              },
            },
            503,
          );
      }
      if (url.includes("buying-power")) {
        return json({ data: { currency: "KRW", cashBuyingPower: "0" } });
      }
      if (url.includes("commissions")) return json({ data: [] });
      return json({ data: { symbol: "AAPL", sellableQuantity: "0" } });
    }));
    renderPanel();
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/stack|sqlite|raw payload/i);
  });
});
