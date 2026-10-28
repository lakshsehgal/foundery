/**
 * How a contract becomes revenue, and when.
 *
 * One rule, used by every screen so the numbers always reconcile:
 *
 *   · A retainer is performance-marketing money. It earns its monthly fee in
 *     every month between its start and end dates — the recurring book.
 *   · A one-off project is creative money. Its whole value lands in the month
 *     the project kicks off, because that's the month the invoice goes out
 *     (the Invoices page raises exactly one invoice for it, on its start
 *     date). No more spreading a project across months it isn't billed in —
 *     the forecast now says what the invoices will say.
 *
 * An undated project can't be placed on a calendar, so callers pass the month
 * it should count in (normally the current month) rather than this file
 * guessing.
 */

export type Contract = {
  engagement: string;
  retainer_amount: number;
  one_time_value: number;
  start_date: string | null;
  end_date: string | null;
};

export function isCreative(contract: Pick<Contract, "engagement">): boolean {
  return contract.engagement !== "retainer";
}

/** The 'YYYY-MM' a project's revenue lands in; null when it has no start date. */
export function landingMonth(contract: Contract): string | null {
  return contract.start_date ? contract.start_date.slice(0, 7) : null;
}

/**
 * Whole months a project runs, both dates inclusive, minimum one. Used on the
 * cost side: the monthly cost-to-serve runs for this long against the one
 * landing of revenue. Without both dates, one month is assumed.
 */
export function projectMonths(start: string | null, end: string | null): number {
  if (!start || !end) return 1;
  const months =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    (Number(end.slice(5, 7)) - Number(start.slice(5, 7))) +
    1;
  return Math.max(1, months);
}

/**
 * Revenue the contract puts into a calendar month ('YYYY-MM').
 * `undatedProjectMonth` is where a project with no start date counts —
 * pass the current month to count it now, or null to skip it entirely
 * (right for historical months, where an undated project proves nothing).
 */
export function revenueInMonth(
  contract: Contract,
  month: string,
  undatedProjectMonth: string | null = null,
): number {
  if (!isCreative(contract)) {
    if (contract.end_date && contract.end_date.slice(0, 7) < month) return 0;
    if (contract.start_date && contract.start_date.slice(0, 7) > month) return 0;
    return contract.retainer_amount;
  }
  const landing = landingMonth(contract) ?? undatedProjectMonth;
  return landing === month ? contract.one_time_value : 0;
}

/**
 * The same month's revenue, split by line of business: performance is the
 * retainer book, creative is one-off project work. Every screen that
 * separates the two derives the split here so they never disagree.
 */
export function revenueSplit(
  contract: Contract,
  month: string,
  undatedProjectMonth: string | null = null,
): { performance: number; creative: number } {
  const value = revenueInMonth(contract, month, undatedProjectMonth);
  return isCreative(contract) ? { performance: 0, creative: value } : { performance: value, creative: 0 };
}

/** Null rather than a confident zero when there's no revenue to divide by. */
export function marginPct(revenue: number, cost: number): number | null {
  if (revenue <= 0) return null;
  return ((revenue - cost) / revenue) * 100;
}

/**
 * A project's margin over its whole life: the one landing of revenue against
 * the monthly cost-to-serve for every month it runs.
 */
export function projectMarginPct(
  total: number,
  monthlyDeliveryCost: number,
  start: string | null,
  end: string | null,
): number | null {
  return marginPct(total, monthlyDeliveryCost * projectMonths(start, end));
}
