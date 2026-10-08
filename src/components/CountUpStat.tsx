"use client";

import { useEffect, useRef, useState } from "react";
import { useInView } from "framer-motion";

export default function CountUpStat({
  value,
  label,
  accent,
  suffix = "",
  decimals = 0,
}: {
  value: number;
  label: string;
  accent?: string;
  suffix?: string;
  decimals?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "-40px" });
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;
    const duration = 900;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(value * eased);
      if (progress < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [inView, value]);

  return (
    <div ref={ref} className="flex flex-col gap-1 min-w-0">
      <span
        className="text-2xl sm:text-3xl md:text-4xl font-bold tabular-nums"
        style={{ color: accent }}
      >
        {display.toFixed(decimals)}
        {suffix}
      </span>
      <span className="text-sm text-muted break-words">{label}</span>
    </div>
  );
}
