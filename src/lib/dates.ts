/** All date handling is calendar-day based (YYYY-MM-DD), no timezone drift. */

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

export function toISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function monthKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export function parseISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDays(iso: string, days: number): string {
  const d = parseISO(iso);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

export function daysBetween(fromISO: string, toISOStr: string): number {
  const a = parseISO(fromISO).getTime();
  const b = parseISO(toISOStr).getTime();
  return Math.round((b - a) / 86_400_000);
}

/** Negative = overdue by N days, positive = due in N days. */
export function daysUntil(dueISO: string, today = todayISO()): number {
  return daysBetween(today, dueISO);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleString("en-GB", { month: "short", year: "numeric" });
}

export function prettyDate(iso?: string | null): string {
  if (!iso) return "—";
  return parseISO(iso).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/** Last N month keys, oldest first, ending with the given month. */
export function lastMonths(n: number, endKey = monthKey()): string[] {
  const [y, m] = endKey.split("-").map(Number);
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(y, m - 1 - i, 1);
    out.push(monthKey(d));
  }
  return out;
}

/** Clamp a billing day (1-31) to a real date inside the given month. */
export function billingDateFor(monthKeyStr: string, day: number): string {
  const [y, m] = monthKeyStr.split("-").map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  const safeDay = Math.min(Math.max(day || 1, 1), lastDay);
  return `${monthKeyStr}-${String(safeDay).padStart(2, "0")}`;
}
