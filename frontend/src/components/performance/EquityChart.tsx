"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  ColorType,
  LineSeries,
  createChart,
  type UTCTimestamp,
} from "lightweight-charts";

import type { EquityPoint } from "@/types/performance";

interface EquityChartProps {
  data: EquityPoint[];
  height?: number;
}

interface NormalizedPoint {
  time: UTCTimestamp;
  value: number;
}

export default function EquityChart({ data, height = 400 }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const normalized = useMemo<NormalizedPoint[]>(() => {
    const sorted = data
      .map((point) => ({
        time: Math.floor(Date.parse(point.timestamp) / 1000) as UTCTimestamp,
        value: point.balance,
      }))
      .filter((point) => Number.isFinite(point.time))
      .sort((a, b) => (a.time as number) - (b.time as number));

    const result: NormalizedPoint[] = [];
    for (const point of sorted) {
      const last = result[result.length - 1];
      if (last && last.time === point.time) {
        last.value = point.value;
      } else {
        result.push(point);
      }
    }
    return result;
  }, [data]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || normalized.length === 0) return;

    const chart = createChart(container, {
      width: container.clientWidth,
      height,
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
      color: "#34d399",
      lineWidth: 2,
      priceLineVisible: false,
      lastValueVisible: true,
    });

    series.setData(normalized);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [normalized, height]);

  if (normalized.length === 0) {
    return (
      <div
        style={{ height }}
        className="flex items-center justify-center text-sm text-slate-400"
      >
        Sin datos de curvas de equidad
      </div>
    );
  }

  return <div ref={containerRef} className="w-full" />;
}