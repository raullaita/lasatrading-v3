"use client";

import { useEffect, useRef } from "react";
import {
  ColorType,
  LineSeries,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts";

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededHash(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

const CANDLE_COUNT = 120;
const HOUR_SECONDS = 3600;
const SIGNAL_OFFSETS = [15, 45, 75, 105];

interface MockStrategyChartProps {
  strategyName: string;
}

export default function MockStrategyChart({
  strategyName,
}: MockStrategyChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rng = mulberry32(seededHash(strategyName));
    const start = Math.floor(Date.now() / 1000) - CANDLE_COUNT * HOUR_SECONDS;
    let value = 100;
    const points: { time: UTCTimestamp; value: number }[] = [];
    for (let i = 0; i < CANDLE_COUNT; i++) {
      value = Math.max(50, value + (rng() - 0.48) * 2.5);
      points.push({
        time: (start + i * HOUR_SECONDS) as UTCTimestamp,
        value: Math.round(value * 100) / 100,
      });
    }

    const trades = SIGNAL_OFFSETS.map((offset, index) => ({
      time: points[offset].time,
      price: points[offset].value,
      side: index % 2 === 0 ? ("buy" as const) : ("sell" as const),
    }));

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 280,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "#94a3b8",
      },
      grid: {
        vertLines: { color: "#1e293b" },
        horzLines: { color: "#1e293b" },
      },
      rightPriceScale: { borderColor: "#334155" },
      timeScale: { borderColor: "#334155" },
    });

    const series = chart.addSeries(LineSeries, {
      color: "#38bdf8",
      lineWidth: 2,
      priceLineVisible: false,
    });
    series.setData(points);

    createSeriesMarkers(
      series,
      trades.map((trade) => ({
        time: trade.time,
        position: trade.side === "buy" ? "belowBar" : "aboveBar",
        shape: trade.side === "buy" ? "arrowUp" : "arrowDown",
        color: trade.side === "buy" ? "#34d399" : "#f87171",
        size: 1,
        text: trade.side === "buy" ? "Entrada" : "Salida",
      }))
    );

    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [strategyName]);

  return <div ref={containerRef} className="w-full" />;
}