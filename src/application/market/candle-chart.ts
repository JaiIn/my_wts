import {
  decodeDecimalString,
  decimalFromString,
} from "../../domain/common/decimal";
import type { MarketCandleView } from "./market-screen";

export type CandleDirection = "falling" | "flat" | "rising";

export type NormalizedCandlePoint = {
  timestamp: string;
  timeSeconds: number;
  open: number;
  high: number;
  low: number;
  close: number;
  direction: CandleDirection;
};

export type CandleChartView = {
  points: readonly NormalizedCandlePoint[];
  minimumPrice?: string;
  maximumPrice?: string;
  zeroRange: boolean;
};

export function buildCandleChartView(
  candles: readonly MarketCandleView[],
): CandleChartView {
  if (candles.length === 0) {
    return { points: [], zeroRange: true };
  }

  const decimal = (value: string) =>
    decimalFromString(decodeDecimalString(value));
  let minimum = decimal(candles[0]!.lowPrice);
  let maximum = decimal(candles[0]!.highPrice);
  for (const candle of candles.slice(1)) {
    const low = decimal(candle.lowPrice);
    const high = decimal(candle.highPrice);
    if (low.lessThan(minimum)) minimum = low;
    if (high.greaterThan(maximum)) maximum = high;
  }
  const range = maximum.minus(minimum);
  const zeroRange = range.isZero();
  const normalize = (value: MarketCandleView["openPrice"]): number =>
    zeroRange
      ? 0.5
      : decimal(value).minus(minimum).dividedBy(range).toNumber();

  const points = [...candles]
    .sort(
      (left, right) =>
        Date.parse(left.timestamp) - Date.parse(right.timestamp),
    )
    .map((candle) => {
      const open = decimal(candle.openPrice);
      const close = decimal(candle.closePrice);
      return {
        timestamp: candle.timestamp,
        timeSeconds: Math.floor(Date.parse(candle.timestamp) / 1000),
        open: normalize(candle.openPrice),
        high: normalize(candle.highPrice),
        low: normalize(candle.lowPrice),
        close: normalize(candle.closePrice),
        direction: close.greaterThan(open)
          ? ("rising" as const)
          : close.lessThan(open)
            ? ("falling" as const)
            : ("flat" as const),
      };
    });

  return {
    points,
    minimumPrice: minimum.toFixed(),
    maximumPrice: maximum.toFixed(),
    zeroRange,
  };
}
