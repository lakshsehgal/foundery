/**
 * How a client's contract becomes a monthly number.
 *
 * Shared rather than founder-scoped because both the clients table and the
 * founder dashboard have to agree: if a project is spread one way on one
 * screen and another way on the next, the margins stop reconciling.
 */

export type Contract = {
  engagement: string;
  retainer_amount: number;
  one_time_value: number;
  start_date: string | null;
  end_date: string | null;
};

/**
 * A fixed-fee project recognised evenly across the months it runs, so it can
 * sit in the same column as a retainer. Undated projects fall back to a
 * three-month spread rather than landing as one spike.
 */
export function spreadProject(value: number, start: string | null, end: string | null): number {
  if (!value) return 0;
  if (!start || !end) return value / 3;
  const months =
    (Number(end.slice(0, 4)) - Number(start.slice(0, 4))) * 12 +
    (Number(end.slice(5, 7)) - Number(start.slice(5, 7))) +
    1;
  return value / Math.max(1, months);
}

export function monthlyRevenue(contract: Contract): number {
  return contract.engagement === "retainer"
    ? contract.retainer_amount
    : spreadProject(contract.one_time_value, contract.start_date, contract.end_date);
}

/** Null rather than a confident zero when there's no revenue to divide by. */
export function marginPct(monthly: number, deliveryCost: number): number | null {
  if (monthly <= 0) return null;
  return ((monthly - deliveryCost) / monthly) * 100;
}
