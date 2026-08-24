export type CurrencyCode = "INR" | "USD" | "GBP" | "EUR" | "AED";

const LOCALES: Record<CurrencyCode, string> = {
  INR: "en-IN",
  USD: "en-US",
  GBP: "en-GB",
  EUR: "de-DE",
  AED: "en-AE",
};

export function defaultCurrency(): CurrencyCode {
  const raw = (process.env.FOUNDERY_CURRENCY || "INR").toUpperCase();
  return (raw in LOCALES ? raw : "INR") as CurrencyCode;
}

export function fmtMoney(amount: number, currency: CurrencyCode = defaultCurrency()): string {
  return new Intl.NumberFormat(LOCALES[currency], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(Math.round(amount || 0));
}

/** Compact form for dashboard tiles: ₹12.4L, ₹1.2Cr, $1.2M. */
export function fmtCompact(amount: number, currency: CurrencyCode = defaultCurrency()): string {
  const n = Math.abs(amount || 0);
  const sign = amount < 0 ? "-" : "";
  const symbol = symbolFor(currency);
  if (currency === "INR") {
    if (n >= 1e7) return `${sign}${symbol}${trim(n / 1e7)}Cr`;
    if (n >= 1e5) return `${sign}${symbol}${trim(n / 1e5)}L`;
    if (n >= 1e3) return `${sign}${symbol}${trim(n / 1e3)}K`;
    return `${sign}${symbol}${Math.round(n)}`;
  }
  if (n >= 1e9) return `${sign}${symbol}${trim(n / 1e9)}B`;
  if (n >= 1e6) return `${sign}${symbol}${trim(n / 1e6)}M`;
  if (n >= 1e3) return `${sign}${symbol}${trim(n / 1e3)}K`;
  return `${sign}${symbol}${Math.round(n)}`;
}

function trim(n: number): string {
  return n >= 100 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, "");
}

export function symbolFor(currency: CurrencyCode): string {
  return { INR: "₹", USD: "$", GBP: "£", EUR: "€", AED: "AED " }[currency];
}

export function fmtPct(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const rounded = Number(value.toFixed(digits));
  // Without this, -0.4 rounded to 0 digits prints "-0%", which reads as a
  // rendering bug rather than "basically break-even".
  return `${(rounded === 0 ? 0 : rounded).toFixed(digits)}%`;
}

/** Normalises any cadence to a comparable monthly figure. */
export function monthlyEquivalent(amount: number, cadence: string): number {
  if (cadence === "annual") return amount / 12;
  if (cadence === "one_time") return 0; // counted in the month it lands, not the run-rate
  return amount;
}
