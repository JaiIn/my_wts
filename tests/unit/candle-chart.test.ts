import { describe, expect, it } from "vitest";

import { buildCandleChartView } from "../../src/application/market/candle-chart";
import type { MarketCandleView } from "../../src/application/market/market-screen";

function candle(
  values: Partial<MarketCandleView> = {},
): MarketCandleView {
  return {
    timestamp: "2025-01-31T00:00:00.000Z",
    openPrice: "100",
    highPrice: "101",
    lowPrice: "99",
    closePrice: "100.5",
    volume: "1",
    currency: "XTS",
    ...values,
  };
}

describe("candle chart view", () => {
  it("normalizes only final chart coordinates while preserving source precision", () => {
    const source = [
      candle({
        openPrice: "9007199254740993.123456780",
        highPrice: "9007199254740993.123456790",
        lowPrice: "9007199254740993.123456770",
        closePrice: "9007199254740993.123456785",
        volume: "90071992547409931234567890",
      }),
    ];
    const before = structuredClone(source);
    const view = buildCandleChartView(source);

    expect(view.minimumPrice).toBe("9007199254740993.12345677");
    expect(view.maximumPrice).toBe("9007199254740993.12345679");
    expect(view.points[0]).toMatchObject({
      open: 0.5,
      high: 1,
      low: 0,
      close: 0.75,
      direction: "rising",
    });
    expect(source).toEqual(before);
    expect(source[0]?.closePrice).toBe("9007199254740993.123456785");
  });

  it("handles a single zero-range candle without NaN or Infinity", () => {
    const view = buildCandleChartView([
      candle({
        openPrice: "185.70",
        highPrice: "185.70",
        lowPrice: "185.70",
        closePrice: "185.70",
      }),
    ]);

    expect(view.zeroRange).toBe(true);
    expect(view.points[0]).toMatchObject({
      open: 0.5,
      high: 0.5,
      low: 0.5,
      close: 0.5,
      direction: "flat",
    });
  });

  it("preserves tiny-spread OHLC ordering after Decimal normalization", () => {
    const view = buildCandleChartView([
      candle({
        openPrice: "0.000000000000000002",
        highPrice: "0.000000000000000004",
        lowPrice: "0.000000000000000001",
        closePrice: "0.000000000000000003",
      }),
    ]);
    const point = view.points[0]!;

    expect(point.low).toBeLessThan(point.open);
    expect(point.open).toBeLessThan(point.close);
    expect(point.close).toBeLessThan(point.high);
  });
});
