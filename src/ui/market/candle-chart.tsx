"use client";

import {
  CandlestickSeries,
  ColorType,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";
import { useEffect, useMemo, useRef } from "react";

import { buildCandleChartView } from "../../application/market/candle-chart";
import type { MarketCandleView } from "../../application/market/market-screen";

export function CandleChart({
  candles,
}: {
  candles: readonly MarketCandleView[];
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartView = useMemo(() => buildCandleChartView(candles), [candles]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const chart = createChart(container, {
      width: Math.max(container.clientWidth, 320),
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "#ffffff" },
        textColor: "#475569",
      },
      grid: {
        vertLines: { color: "#e2e8f0" },
        horzLines: { color: "#e2e8f0" },
      },
      rightPriceScale: { visible: false },
      timeScale: {
        borderColor: "#cbd5e1",
        timeVisible: true,
        secondsVisible: false,
      },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: "#047857",
      downColor: "#b91c1c",
      borderVisible: true,
      wickUpColor: "#047857",
      wickDownColor: "#b91c1c",
    });
    series.setData(
      chartView.points.map(({ close, high, low, open, timeSeconds }) => ({
        time: timeSeconds as UTCTimestamp,
        open,
        high,
        low,
        close,
      })),
    );
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(([entry]) => {
      const width = entry?.contentRect.width;
      if (width) {
        chart.applyOptions({ width: Math.max(width, 320) });
      }
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [chartView]);

  return (
    <div
      ref={containerRef}
      aria-hidden="true"
      className="h-[280px] min-w-[20rem] overflow-hidden rounded-xl border border-slate-200 bg-white"
      data-testid="candle-chart"
    />
  );
}
