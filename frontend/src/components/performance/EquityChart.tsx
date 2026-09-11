"use client";

import { useEffect, useRef } from "react";
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

export default function EquityChart({ data, height = 400 }: EquityChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || data.length === 0) return;

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

    const lineData = data.map((point) => ({
      time: Math.floor(Date.parse(point.timestamp) / 1000) as UTCTimestamp,
      value: point.balance,
    }));
    series.setData(lineData);
    chart.timeScale().fitContent();

    const observer = new ResizeObserver(() => {
      chart.applyOptions({ width: container.clientWidth });
    });
    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.remove();
    };
  }, [data, height]);

  if (data.length === 0) {
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