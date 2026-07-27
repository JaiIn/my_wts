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
    fireEvent.change(screen.getByRole("combobox"), {
      target: { value: "missing" },
    });

    expect(screen.getByRole("status").textContent).toBe(
      "일치하는 종목이 없습니다.",
    );
    expect(screen.queryByText("등락")).toBeNull();
    expect(screen.queryByText("등락률")).toBeNull();
    expect(screen.queryByText("거래량")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not render authentication or database internals into the client view", async () => {
    await renderMarketPage();
    const html = document.body.innerHTML;

    expect(html).not.toContain("my_wts_session");
    expect(html).not.toContain("passwordHash");
    expect(html).not.toContain("sessionTokenHash");
    expect(html).not.toContain("accountSeq");
  });
});
