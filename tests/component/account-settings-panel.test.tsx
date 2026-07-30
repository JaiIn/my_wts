// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AccountSettingsPanel } from "../../src/ui/account/account-settings-panel";
import { MarketQueryProvider } from "../../src/ui/market/market-query-provider";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ACCOUNTS = [
  {
    accountRef: "acct_component_reference_0001",
    maskedAccountNo: "*******1234",
    accountType: "BROKERAGE",
    selected: false,
  },
  {
    accountRef: "acct_component_reference_0002",
    maskedAccountNo: "*******5678",
    accountType: "FUTURE_ACCOUNT_TYPE",
    selected: false,
  },
];

function response(accounts: unknown, status = 200) {
  return new Response(
    JSON.stringify(
      status < 400
        ? { data: { accounts }, meta: { requestId: "component-account" } }
        : {
            error: {
              requestId: "component-account",
              code: "UPSTREAM_UNAVAILABLE",
              retryable: false,
              details: {},
            },
          },
    ),
    {
      status,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
      },
    },
  );
}

function renderPanel(liveReadEnabled = false) {
  return render(
    <MarketQueryProvider>
      <AccountSettingsPanel liveReadEnabled={liveReadEnabled} />
    </MarketQueryProvider>,
  );
}

describe("account settings panel", () => {
  it("renders loading, multiple, known and unknown account states safely", async () => {
    const fetch = vi.fn(async () => response(ACCOUNTS));
    vi.stubGlobal("fetch", fetch);
    renderPanel();
    expect(
      screen.getByText("계좌 목록을 불러오는 중입니다."),
    ).toBeTruthy();
    expect(await screen.findByText("종합매매")).toBeTruthy();
    expect(screen.getByText("기타 계좌 유형")).toBeTruthy();
    expect(screen.getAllByTestId("masked-account-no")).toHaveLength(2);
    expect(screen.getByText("*******1234")).toBeTruthy();
    expect(screen.getByText("*******5678")).toBeTruthy();
    expect(screen.getAllByText("선택되지 않음")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(
      /00000001234|accountSeq|acct_component_reference|선택하기|매수|매도/,
    );
    expect(screen.queryByRole("button", { name: /주문|선택/ })).toBeNull();
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/accounts",
      expect.objectContaining({
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
      }),
    );
  });

  it("renders empty and safe error states independently", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([])));
    const empty = renderPanel();
    expect(
      await screen.findByText("표시할 계좌가 없습니다."),
    ).toBeTruthy();
    empty.unmount();

    vi.stubGlobal("fetch", vi.fn(async () => response(null, 503)));
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "계좌 목록을 불러오지 못했습니다.",
    );
    expect(document.body.textContent).not.toMatch(
      /stack|sqlite|authorization|accountSeq|accountNo/i,
    );
  });

  it("switches mock/live disclosure using only the boolean prop", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => response([])));
    const mock = renderPanel(false);
    expect(await screen.findByText("MOCK DATA")).toBeTruthy();
    mock.unmount();

    renderPanel(true);
    expect(
      await screen.findByText("Toss Open API · 조회 전용"),
    ).toBeTruthy();
    expect(document.body.textContent).not.toMatch(
      /client.?secret|access.?token|openapi\.tossinvest\.com/i,
    );
  });

  it("refreshes only the account query and prevents duplicate refresh", async () => {
    const fetch = vi.fn(async () => response(ACCOUNTS.slice(0, 1)));
    vi.stubGlobal("fetch", fetch);
    renderPanel();
    const refresh = await screen.findByRole("button", {
      name: "목록 새로고침",
    });
    fireEvent.click(refresh);
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
    expect(screen.getAllByTestId("masked-account-no")).toHaveLength(1);
    expect(
      screen.queryByRole("button", { name: /계좌 선택|주문/ }),
    ).toBeNull();
  });
});
