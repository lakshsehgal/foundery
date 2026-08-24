"use client";

import { useEffect, useRef, useState } from "react";
import { fmtCompact, fmtMoney, fmtPct, type CurrencyCode } from "@/lib/money";

type Format = "compact" | "money" | "int" | "pct";

function render(value: number, format: Format, currency?: CurrencyCode, digits = 0): string {
  switch (format) {
    case "compact": return fmtCompact(value, currency);
    case "money": return fmtMoney(value, currency);
    case "pct": return fmtPct(value, digits);
    default: return digits > 0 ? value.toFixed(digits) : String(Math.round(value));
  }
}

/**
 * A number that counts up to its value on mount — the monday-style tell that
 * something live just arrived. The full value is server-rendered first, so
 * nothing depends on JS: the animation replaces a correct number with a
 * moving one, never a blank with a late one. Respects reduced-motion.
 */
export function Ticker({
  value, format = "int", currency, digits = 0, durationMs = 650,
}: {
  value: number;
  format?: Format;
  currency?: CurrencyCode;
  digits?: number;
  durationMs?: number;
}) {
  // Server-rendered at the real value, so the number is correct without JS;
  // the animation then replays it counting up. All setState happens inside
  // animation frames, never synchronously in the effect body.
  const [shown, setShown] = useState(value);
  const frame = useRef(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setShown(value * eased);
      if (t < 1) frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [value, durationMs]);

  return <span className="tabular">{render(shown, format, currency, digits)}</span>;
}
