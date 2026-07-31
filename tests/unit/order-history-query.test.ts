import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import {
  OrderHistoryValidationError,
  parseOrderHistoryQuery,
} from "../../src/application/orders/order-history-query";

function request(query: string, headers?: HeadersInit) {
  return new NextRequest(`http://127.0.0.1:3000/api/v1/orders${query}`, {
    headers,
  });
}

describe("order history query parser", () => {
  it("parses the frozen query contract and preserves an opaque cursor", () => {
    expect(
      parseOrderHistoryQuery(
        request(
          "?status=CLOSED&symbol=aapl&from=2026-01-01&to=2026-01-31&cursor=opaque%2Bcursor%3D&limit=100",
        ),
      ),
    ).toEqual({
      status: "CLOSED",
      symbol: "AAPL",
      from: "2026-01-01",
      to: "2026-01-31",
      cursor: "opaque+cursor=",
      limit: 100,
    });
  });

  it("defaults limit to 20 and supports OPEN", () => {
    expect(parseOrderHistoryQuery(request("?status=OPEN"))).toEqual({
      status: "OPEN",
      limit: 20,
    });
  });

  it.each([
    "",
    "?status=",
    "?status=PENDING",
    "?status=OPEN,CLOSED",
    "?status=OPEN&status=CLOSED",
    "?status=OPEN&unknown=1",
    "?status=OPEN&symbol=",
    "?status=OPEN&symbol=../AAPL",
    "?status=OPEN&symbol=AAPL,005930",
    "?status=OPEN&from=2026-02-30",
    "?status=OPEN&to=2026-13-01",
    "?status=OPEN&from=2026-02-02&to=2026-02-01",
    "?status=CLOSED&cursor=",
    "?status=CLOSED&limit=0",
    "?status=CLOSED&limit=101",
    "?status=CLOSED&limit=1.5",
    "?status=CLOSED&limit=1e2",
    "?status=CLOSED&limit=%2B1",
    "?status=CLOSED&limit=%201",
    "?status=CLOSED&cursor=%ZZ",
  ])("rejects an invalid query: %s", (query) => {
    expect(() => parseOrderHistoryQuery(request(query))).toThrow(
      OrderHistoryValidationError,
    );
  });

  it("rejects a request body signal", () => {
    expect(() =>
      parseOrderHistoryQuery(
        request("?status=OPEN", { "Content-Length": "1" }),
      ),
    ).toThrow(OrderHistoryValidationError);
  });
});
