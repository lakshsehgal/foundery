import "server-only";
import { getDb, getSetting } from "./db";
import { costTotals } from "./queries";
import { addDays, billingDateFor, daysBetween, lastMonths, monthLabel, parseISO, todayISO } from "./dates";

/**
 * Founder-only cash maths. Where analytics answers "is the business sound",
 * this answers the blunter question: "is there money in the account in week
 * three". Everything derives from data the app already holds — billing days,
 * payment terms, the raise/paid ticks, and the cost base — plus one number
 * typed by hand: the bank balance.
 */

/* ------------------------------------------------------------- contracts */

type BillableRow = {
  id: number; name: string; vip: boolean; engagement: string; billing_day: number;
  retainer_amount: number; one_time_value: number; terms_days: number;
  start_date: string | null; end_date: string | null; status: string;
};

type Mark = { client_id: number; month: string; raised_at: string; paid_at: string | null };

async function billableClients(): Promise<BillableRow[]> {
  const db = await getDb();
  // SELECT * so a database mid-migration still serves the page.
  return db.query<BillableRow>(
    `SELECT * FROM foundery.clients WHERE status = 'active'`,
  );
}

async function marksFor(months: string[]): Promise<Mark[]> {
  const db = await getDb();
  try {
    return await db.query<Mark>(
      `SELECT client_id, month, raised_at, paid_at FROM foundery.raised_invoices
       WHERE month = ANY($1)`,
      [months],
    );
  } catch {
    return [];
  }
}

/** The invoice a client should raise in a month, if any: amount + raise date. */
function billableIn(client: BillableRow, month: string): { amount: number; raiseOn: string } | null {
  if (client.engagement === "one_time") {
    if (!client.start_date || client.start_date.slice(0, 7) !== month) return null;
    return { amount: client.one_time_value, raiseOn: client.start_date };
  }
  if (client.start_date && client.start_date.slice(0, 7) > month) return null;
  if (client.end_date && client.end_date.slice(0, 7) < month) return null;
  return { amount: client.retainer_amount, raiseOn: billingDateFor(month, client.billing_day) };
}

function monthsAround(today: string, back: number, forward: number): string[] {
  const [year, month] = today.slice(0, 7).split("-").map(Number);
  const out: string[] = [];
  for (let i = -back; i <= forward; i++) {
    const d = new Date(year, month - 1 + i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}

/* ---------------------------------------------------------- cash calendar */

export type CashInflow = {
  clientName: string;
  vip: boolean;
  monthLabel: string;
  amount: number;
  /** Best guess for the day the money lands. */
  expectedOn: string;
  status: "overdue" | "raised" | "upcoming";
};

export type CashWeek = {
  start: string;
  end: string;
  label: string;
  inflow: number;
  outflow: number;
  net: number;
  /** Projected balance at week's end; null when no bank balance is set. */
  balance: number | null;
};

export type CashCalendar = {
  openingBalance: number | null;
  salaryDay: number;
  weeks: CashWeek[];
  inflows: CashInflow[];
  /** The projected low point across the window. */
  low: { label: string; balance: number } | null;
  in30Days: number;
};

/**
 * Ten weeks of expected cash. Inflow timing per invoice:
 *  - paid → nothing left to expect;
 *  - raised, unpaid → the raise date the mark recorded + the client's terms;
 *  - not yet raised → its billing date + terms (a raise past due is assumed
 *    to go out now).
 * Salaries leave as one lump on the salary day; every other running cost
 * drips out evenly through the month.
 */
export async function cashCalendar(today = todayISO()): Promise<CashCalendar> {
  const [clients, bufferRaw, salaryDayRaw, totals] = await Promise.all([
    billableClients(),
    getSetting("cash_buffer", ""),
    getSetting("salary_day", "1"),
    costTotals(),
  ]);
  const months = monthsAround(today, 1, 3);
  const marks = await marksFor(months);
  const marked = new Map(marks.map((mark) => [`${mark.client_id}:${mark.month}`, mark]));

  const openingBalance = bufferRaw === "" ? null : Number(bufferRaw);
  const salaryDay = Math.min(28, Math.max(1, Number(salaryDayRaw) || 1));
  const horizon = addDays(today, 70);

  const inflows: CashInflow[] = [];
  for (const month of months) {
    for (const client of clients) {
      const billable = billableIn(client, month);
      if (!billable || billable.amount <= 0) continue;
      const mark = marked.get(`${client.id}:${month}`);
      if (mark?.paid_at) continue;

      let expectedOn: string;
      let status: CashInflow["status"];
      if (mark) {
        expectedOn = addDays(String(mark.raised_at).slice(0, 10), client.terms_days);
        status = expectedOn < today ? "overdue" : "raised";
      } else if (billable.raiseOn < today) {
        // Not raised and past the billing day: assume it goes out today.
        expectedOn = addDays(today, client.terms_days);
        status = "overdue";
      } else {
        expectedOn = addDays(billable.raiseOn, client.terms_days);
        status = "upcoming";
      }
      if (expectedOn > horizon) continue;

      inflows.push({
        clientName: client.name,
        vip: client.vip,
        monthLabel: monthLabel(month),
        amount: billable.amount,
        expectedOn,
        status,
      });
    }
  }
  inflows.sort((a, b) => a.expectedOn.localeCompare(b.expectedOn));

  const salaryMonthly = totals.find((t) => t.category === "salary")?.total ?? 0;
  const otherMonthly = totals.reduce((sum, t) => sum + t.total, 0) - salaryMonthly;
  const otherDaily = (otherMonthly * 12) / 365;

  const weeks: CashWeek[] = [];
  let running = openingBalance;
  for (let i = 0; i < 10; i++) {
    const start = addDays(today, i * 7);
    const end = addDays(start, 6);

    let inflow = 0;
    for (const item of inflows) {
      // Money already late is expected in the first week, not lost in the past.
      const lands = i === 0 && item.expectedOn < start ? start : item.expectedOn;
      if (lands >= start && lands <= end) inflow += item.amount;
    }

    let outflow = otherDaily * 7;
    for (let d = 0; d < 7; d++) {
      if (Number(addDays(start, d).slice(8, 10)) === salaryDay) outflow += salaryMonthly;
    }

    const net = inflow - outflow;
    running = running === null ? null : running + net;
    const startDate = parseISO(start);
    const endDate = parseISO(end);
    const sameMonth = startDate.getMonth() === endDate.getMonth();
    const label = `${startDate.getDate()}${
      sameMonth ? "" : ` ${startDate.toLocaleDateString("en-GB", { month: "short" })}`
    }–${endDate.getDate()} ${endDate.toLocaleDateString("en-GB", { month: "short" })}`;

    weeks.push({ start, end, label, inflow, outflow: Math.round(outflow), net: Math.round(net), balance: running === null ? null : Math.round(running) });
  }

  const withBalance = weeks.filter((week) => week.balance !== null);
  const low = withBalance.length
    ? withBalance.reduce((a, b) => ((b.balance ?? 0) < (a.balance ?? 0) ? b : a))
    : null;

  const in30 = addDays(today, 30);
  const in30Days = inflows
    .filter((item) => item.expectedOn <= in30)
    .reduce((sum, item) => sum + item.amount, 0);

  return {
    openingBalance,
    salaryDay,
    weeks,
    inflows,
    low: low ? { label: low.label, balance: low.balance ?? 0 } : null,
    in30Days,
  };
}

/* ------------------------------------------------- contracted vs collected */

export type HonestyMonth = {
  month: string;
  label: string;
  /** What the book said should be billed in the month. */
  contracted: number;
  /** What the raise ticks say actually went out. */
  raised: number;
  /** Of what went out, what has been marked paid. */
  collected: number;
  /** Contracted but never billed — the silent gap. */
  leakage: number;
  /** Billed but not yet in the bank. */
  lag: number;
};

export async function billingHonesty(today = todayISO()): Promise<HonestyMonth[]> {
  const clients = await billableClients();
  const months = lastMonths(3, today.slice(0, 7));
  const marks = await marksFor(months);
  const marked = new Map(marks.map((mark) => [`${mark.client_id}:${mark.month}`, mark]));

  return months.map((month) => {
    let contracted = 0;
    let raised = 0;
    let collected = 0;
    for (const client of clients) {
      const billable = billableIn(client, month);
      if (!billable || billable.amount <= 0) continue;
      contracted += billable.amount;
      const mark = marked.get(`${client.id}:${month}`);
      if (mark) raised += billable.amount;
      if (mark?.paid_at) collected += billable.amount;
    }
    return {
      month,
      label: monthLabel(month),
      contracted,
      raised,
      collected,
      leakage: Math.max(0, contracted - raised),
      lag: Math.max(0, raised - collected),
    };
  });
}

/* -------------------------------------------------------- collection speed */

export type CollectionSpeed = {
  clientName: string;
  termsDays: number;
  /** Average days from the raise tick to the paid tick. */
  avgDays: number;
  samples: number;
};

/**
 * How long each client actually takes to pay, measured between your own two
 * ticks. "Net 15" is a claim; this is the record.
 */
export async function collectionSpeed(): Promise<CollectionSpeed[]> {
  const db = await getDb();
  let rows: { name: string; terms_days: number; raised_at: string; paid_at: string }[] = [];
  try {
    rows = await db.query(
      `SELECT c.name, c.terms_days, r.raised_at, r.paid_at
       FROM foundery.raised_invoices r JOIN foundery.clients c ON c.id = r.client_id
       WHERE r.paid_at IS NOT NULL`,
    );
  } catch {
    return [];
  }

  const byClient = new Map<string, { termsDays: number; total: number; samples: number }>();
  for (const row of rows) {
    const days = Math.max(
      0,
      daysBetween(String(row.raised_at).slice(0, 10), String(row.paid_at).slice(0, 10)),
    );
    const bucket = byClient.get(row.name) ?? { termsDays: row.terms_days, total: 0, samples: 0 };
    bucket.total += days;
    bucket.samples += 1;
    byClient.set(row.name, bucket);
  }

  return [...byClient.entries()]
    .map(([clientName, bucket]) => ({
      clientName,
      termsDays: bucket.termsDays,
      avgDays: Math.round(bucket.total / bucket.samples),
      samples: bucket.samples,
    }))
    .sort((a, b) => b.avgDays - a.avgDays);
}
