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
    expect(screen.getByText("계좌 목록을 불러오는 중입니다.")).toBeTruthy();
    expect(await screen.findByText("종합매매")).toBeTruthy();
    expect(screen.getByText("기타 계좌 유형")).toBeTruthy();
    expect(screen.getAllByTestId("masked-account-no")).toHaveLength(2);
    expect(screen.getByText("*******1234")).toBeTruthy();
    expect(screen.getByText("*******5678")).toBeTruthy();
    expect(screen.getAllByText("선택되지 않음")).toHaveLength(2);
    expect(document.body.textContent).not.toMatch(
      /00000001234|accountSeq|acct_component_reference|매수|매도/,
    );
    expect(
      screen.getAllByRole("button", { name: "이 계좌 선택" }),
    ).toHaveLength(2);
    expect(screen.queryByRole("button", { name: /주문/ })).toBeNull();
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
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response([])),
    );
    const empty = renderPanel();
    expect(await screen.findByText("표시할 계좌가 없습니다.")).toBeTruthy();
    empty.unmount();

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response(null, 503)),
    );
    renderPanel();
    expect((await screen.findByRole("alert")).textContent).toContain(
      "계좌 목록을 불러오지 못했습니다.",
    );
    expect(document.body.textContent).not.toMatch(
      /stack|sqlite|authorization|accountSeq|accountNo/i,
    );
  });

  it("switches mock/live disclosure using only the boolean prop", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => response([])),
    );
    const mock = renderPanel(false);
    expect(await screen.findByText("MOCK DATA")).toBeTruthy();
    mock.unmount();

    renderPanel(true);
    expect(await screen.findByText("Toss Open API · 조회 전용")).toBeTruthy();
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
    expect(screen.getByRole("button", { name: "이 계좌 선택" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /주문/ })).toBeNull();
  });

  it("selects, changes, and clears explicitly without exposing the reference", async () => {
    let selectedIndex: number | undefined;
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        const body = JSON.parse(String(init.body)) as { accountRef: string };
        selectedIndex = ACCOUNTS.findIndex(
          (account) => account.accountRef === body.accountRef,
        );
        return new Response(null, { status: 204 });
      }
      if (init?.method === "DELETE") {
        selectedIndex = undefined;
        return new Response(null, { status: 204 });
      }
      return response(
        ACCOUNTS.map((account, index) => ({
          ...account,
          selected: index === selectedIndex,
        })),
      );
    });
    vi.stubGlobal("fetch", fetch);
    renderPanel();

    const selectButtons = await screen.findAllByRole("button", {
      name: "이 계좌 선택",
    });
    fireEvent.click(selectButtons[0]);
    await screen.findByRole("button", { name: "선택됨" });
    expect(screen.getByRole("button", { name: "선택 해제" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "이 계좌 선택" }));
    await waitFor(() =>
      expect(screen.getAllByText("현재 선택된 계좌")).toHaveLength(1),
    );

    fireEvent.click(screen.getByRole("button", { name: "선택 해제" }));
    await screen.findByText("사용할 계좌를 직접 선택해 주세요.");
    expect(document.body.textContent).not.toContain("acct_component_reference");
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/session/account",
      expect.objectContaining({
        method: "PUT",
        credentials: "same-origin",
      }),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/v1/session/account",
      expect.objectContaining({
        method: "DELETE",
        credentials: "same-origin",
      }),
    );
  });

  it("keeps the last valid selection visible when a change fails", async () => {
    const selected = ACCOUNTS.map((account, index) => ({
      ...account,
      selected: index === 0,
    }));
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") return response(null, 409);
      return response(selected);
    });
    vi.stubGlobal("fetch", fetch);
    renderPanel();
    expect(await screen.findByRole("button", { name: "선택됨" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "이 계좌 선택" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("button", { name: "선택됨" })).toBeTruthy();
  });
});
