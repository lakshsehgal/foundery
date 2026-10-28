import "server-only";
import { getDb, getSetting } from "./db";
import { billingTasks, costsForMonth, costTotals, monthlyBurn } from "./queries";
import { defaultCurrency, fmtCompact } from "./money";
import { lastMonths, monthKey, monthLabel, todayISO } from "./dates";
import type { CostCategory, Health } from "./taxonomy";
import {
  isCreative, marginPct, projectMarginPct, projectMonths, revenueInMonth, type Contract,
} from "./economics";

/**
 * Founder-only maths. Nothing here is called from an operator screen — the
 * route guard is the fence, and these functions carry no redaction of their
 * own precisely so that fence stays the only thing to check.
 */

/* ---------------------------------------------------------------- clients */

export type ClientEconomics = {
  id: number;
  name: string;
  vip: boolean;
  engagement: string;
  health: Health;
  /** When the contract ends — the forecast reads this. */
  endDate: string | null;
  /** This month's contracted revenue: a retainer's fee, or a project landing now. */
  monthRevenue: number;
  /** The margin-table number: monthly fee for a retainer, whole contract for a project. */
  bookValue: number;
  /** Against bookValue: monthly for a retainer, the whole delivery cost for a project. */
  deliveryCost: number;
  grossProfit: number;
  /** null rather than a confident 0 when there is no revenue to divide by. */
  marginPct: number | null;
  /** Share of this month's total contracted revenue. */
  shareOfRevenuePct: number;
};

export async function clientEconomics(month = monthKey()): Promise<ClientEconomics[]> {
  const db = await getDb();
  const rows = await db.query<{
    id: number; name: string; vip: boolean; engagement: string; health: string;
    retainer_amount: number; one_time_value: number; delivery_cost: number;
    start_date: string | null; end_date: string | null;
  }>(
    `SELECT id, name, vip, engagement, health, retainer_amount, one_time_value,
            delivery_cost, start_date, end_date
     FROM foundery.clients WHERE status = 'active'`,
  );

  const priced = rows.map((row) => {
    const creative = isCreative(row);
    const bookValue = creative ? row.one_time_value : row.retainer_amount;
    const deliveryCost = creative
      ? row.delivery_cost * projectMonths(row.start_date, row.end_date)
      : row.delivery_cost;
    return {
      id: row.id,
      name: row.name,
      vip: row.vip,
      engagement: row.engagement,
      health: row.health as Health,
      endDate: row.end_date,
      monthRevenue: revenueInMonth(row, month, month),
      bookValue,
      deliveryCost,
      grossProfit: bookValue - deliveryCost,
      marginPct: creative
        ? projectMarginPct(row.one_time_value, row.delivery_cost, row.start_date, row.end_date)
        : marginPct(row.retainer_amount, row.delivery_cost),
      shareOfRevenuePct: 0,
    };
  });

  const total = priced.reduce((sum, c) => sum + c.monthRevenue, 0);
  for (const client of priced) {
    client.shareOfRevenuePct = total > 0 ? (client.monthRevenue / total) * 100 : 0;
  }
  return priced.sort((a, b) => b.monthRevenue - a.monthRevenue || b.bookValue - a.bookValue);
}

/* --------------------------------------------------------------- headline */

export type Headline = {
  /** This month's contracted revenue: performance + creative landing now. */
  revenue: number;
  /** The performance-marketing book: retainers earning this month. */
  performance: number;
  /** Creative one-offs landing this month. */
  creative: number;
  retainerClients: number;
  projectClients: number;
  burn: number;
  grossProfit: number;
  netProfit: number;
  netMarginPct: number | null;
  deliveryCost: number;
  activeClients: number;
  vipClients: number;
  /** Months of cost the cash buffer covers. null when no buffer is recorded. */
  runwayMonths: number | null;
  cashBuffer: number | null;
};

export async function headline(): Promise<Headline> {
  const [economics, burn, bufferRaw] = await Promise.all([
    clientEconomics(),
    monthlyBurn(),
    getSetting("cash_buffer", ""),
  ]);
  const revenue = economics.reduce((sum, c) => sum + c.monthRevenue, 0);
  const retainers = economics.filter((c) => c.engagement === "retainer");
  const performance = retainers.reduce((sum, c) => sum + c.monthRevenue, 0);
  // Delivery cost against this month's revenue: monthly for retainers, the
  // whole delivery cost for a project landing now (whole revenue, whole cost).
  const deliveryCost = economics.reduce(
    (sum, c) => sum + (c.monthRevenue > 0 ? c.deliveryCost : 0),
    0,
  );
  const netProfit = revenue - burn;
  const cashBuffer = bufferRaw === "" ? null : Number(bufferRaw);

  return {
    revenue,
    performance,
    creative: revenue - performance,
    retainerClients: retainers.length,
    projectClients: economics.length - retainers.length,
    burn,
    grossProfit: revenue - deliveryCost,
    netProfit,
    netMarginPct: revenue > 0 ? (netProfit / revenue) * 100 : null,
    deliveryCost,
    activeClients: economics.length,
    vipClients: economics.filter((c) => c.vip).length,
    runwayMonths:
      cashBuffer !== null && burn > 0 ? cashBuffer / burn : null,
    cashBuffer,
  };
}

/* ------------------------------------------------------------- efficiency */

export type Efficiency = {
  /** Active salary rows — one per person, same source as "Salaries — N people". */
  headcount: number;
  payroll: number;
  revenuePerHead: number | null;
  profitPerHead: number | null;
  /** Salaries as a share of monthly revenue. */
  payrollSharePct: number | null;
  /** Cost to serve as a share of monthly revenue, across the whole book. */
  deliverySharePct: number | null;
  /** Average monthly revenue per active client. */
  avgClientValue: number | null;
};

/**
 * Per-head and per-client leverage. Pure maths over numbers the dashboard
 * already fetches — headcount is the count of active salary rows, so it stays
 * in step with the Costs screen without another query.
 */
export function efficiency(
  head: Headline,
  totals: { category: CostCategory; total: number; count: number }[],
): Efficiency {
  const salaries = totals.find((t) => t.category === "salary");
  const headcount = salaries?.count ?? 0;
  const payroll = salaries?.total ?? 0;
  return {
    headcount,
    payroll,
    revenuePerHead: headcount > 0 ? head.revenue / headcount : null,
    profitPerHead: headcount > 0 ? head.netProfit / headcount : null,
    payrollSharePct: head.revenue > 0 ? (payroll / head.revenue) * 100 : null,
    deliverySharePct: head.revenue > 0 ? (head.deliveryCost / head.revenue) * 100 : null,
    avgClientValue: head.activeClients > 0 ? head.revenue / head.activeClients : null,
  };
}

/* -------------------------------------------------------- media buyer load */

export type BuyerLoad = {
  id: number;
  name: string;
  capacity: number;
  clients: number;
  /** Monthly retainer revenue riding on this buyer. */
  mrr: number;
};

export type MediaBuyerLoad = {
  buyers: BuyerLoad[];
  unassigned: { clients: number; mrr: number };
  totalRetainers: number;
  totalCapacity: number;
  /** Positive = seats free across the bench; negative = clients over capacity. */
  headroom: number;
};

/**
 * Who carries what. Only active retainers count — a one-off project's buying
 * is scoped into the project, not a seat on the bench. Null until the
 * media_buyers table exists (it ships in db/schema.sql).
 */
export async function mediaBuyerLoad(): Promise<MediaBuyerLoad | null> {
  const db = await getDb();
  try {
    const [buyers, clients] = await Promise.all([
      db.query<{ id: number; name: string; capacity: number }>(
        `SELECT id, name, capacity FROM foundery.media_buyers
         WHERE active ORDER BY created_at ASC, id ASC`,
      ),
      db.query<{ media_buyer_id: number | null; retainer_amount: number }>(
        `SELECT media_buyer_id, retainer_amount FROM foundery.clients
         WHERE status = 'active' AND engagement = 'retainer'`,
      ),
    ]);

    const loads = buyers.map((buyer) => ({ ...buyer, clients: 0, mrr: 0 }));
    const byId = new Map(loads.map((load) => [load.id, load]));
    const unassigned = { clients: 0, mrr: 0 };
    for (const client of clients) {
      const bucket = (client.media_buyer_id && byId.get(client.media_buyer_id)) || null;
      if (bucket) {
        bucket.clients += 1;
        bucket.mrr += client.retainer_amount;
      } else {
        unassigned.clients += 1;
        unassigned.mrr += client.retainer_amount;
      }
    }

    const totalCapacity = loads.reduce((sum, load) => sum + load.capacity, 0);
    return {
      buyers: loads,
      unassigned,
      totalRetainers: clients.length,
      totalCapacity,
      headroom: totalCapacity - clients.length,
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------- projection */

export type ProjectedMonth = {
  month: string;
  label: string;
  revenue: number;
  /** Retainer revenue in the month — performance marketing, renews by itself. */
  performance: number;
  /** Creative one-offs landing in the month: already-signed projects kicking off then. */
  creative: number;
  costs: number;
  profit: number;
  /** Confidence shrinks the further out we look. */
  confidence: "booked" | "likely" | "assumed";
};

/**
 * Forward revenue from contracts that already exist — no growth assumption
 * baked in. A retainer counts in every month between its dates; a project's
 * whole value lands in its kickoff month, exactly as it will be invoiced.
 * Anything past a client's end date simply isn't there, which is the point:
 * the shape of the curve shows the cliff before it arrives.
 */
export async function projection(months = 6): Promise<ProjectedMonth[]> {
  const db = await getDb();
  const rows = await db.query<Contract>(
    `SELECT engagement, retainer_amount, one_time_value, start_date, end_date
     FROM foundery.clients WHERE status IN ('active','paused')`,
  );

  const burn = await monthlyBurn();
  const start = new Date();
  const currentKey = monthKey(start);
  const out: ProjectedMonth[] = [];

  for (let i = 0; i < months; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = monthKey(date);
    let performance = 0;
    let creative = 0;
    for (const row of rows) {
      // An undated project can only be counted somewhere once: the current month.
      const value = revenueInMonth(row, key, key === currentKey ? currentKey : null);
      if (isCreative(row)) creative += value;
      else performance += value;
    }
    const revenue = performance + creative;
    out.push({
      month: key,
      label: monthLabel(key),
      revenue,
      performance,
      creative,
      costs: burn,
      profit: revenue - burn,
      confidence: i === 0 ? "booked" : i <= 2 ? "likely" : "assumed",
    });
  }
  return out;
}

/* ------------------------------------------------------ revenue by service */

export type ServiceRevenue = {
  service: string;
  /** From retainers — the performance-marketing book. */
  performance: number;
  /** From one-off projects landing this month — the creative book. */
  creative: number;
  total: number;
  clients: number;
};

/**
 * Where this month's revenue actually comes from, by the services tagged on
 * each client. A client with three services splits its revenue evenly across
 * them — the tags don't carry their own prices, so an even split is the
 * honest allocation rather than an invented one.
 */
export async function serviceRevenue(month = monthKey()): Promise<ServiceRevenue[]> {
  const db = await getDb();
  const rows = await db.query<Contract & { services: unknown }>(
    `SELECT engagement, retainer_amount, one_time_value, start_date, end_date, services
     FROM foundery.clients WHERE status = 'active'`,
  );

  const buckets = new Map<string, ServiceRevenue>();
  for (const row of rows) {
    const revenue = revenueInMonth(row, month, month);
    const services = Array.isArray(row.services) && row.services.length > 0
      ? (row.services as string[])
      : ["No service tagged"];
    const slice = revenue / services.length;
    for (const service of services) {
      const bucket =
        buckets.get(service) ??
        { service, performance: 0, creative: 0, total: 0, clients: 0 };
      bucket.clients += 1;
      if (isCreative(row)) bucket.creative += slice;
      else bucket.performance += slice;
      bucket.total += slice;
      buckets.set(service, bucket);
    }
  }

  return [...buckets.values()]
    .filter((bucket) => bucket.total > 0)
    .sort((a, b) => b.total - a.total);
}

/* ------------------------------------------------------------------- risk */

export type RiskFinding = {
  key: string;
  title: string;
  detail: string;
  severity: "good" | "warning" | "serious" | "critical";
  /** The number the finding is about, already formatted by the caller. */
  metric: string;
  /** What to actually do about it. */
  action: string;
};

export type RiskReport = {
  score: number;              // 0 (calm) … 100 (on fire)
  band: "steady" | "watch" | "exposed";
  findings: RiskFinding[];
};

const SEVERITY_WEIGHT = { good: 0, warning: 8, serious: 18, critical: 30 };

/**
 * The six ways a small agency actually gets hurt: one client is too much of
 * the revenue, the money is late, the margin is thin, the cost base is fixed
 * while the revenue isn't, an account is quietly on its way out, and too much
 * of the book is one-off work that has to be re-sold every quarter. Each is
 * scored on its own and the report is the sum, capped — one critical finding
 * shouldn't be averaged away by five calm ones.
 */
export async function riskReport(today = todayISO()): Promise<RiskReport> {
  const findings: RiskFinding[] = [];
  const economics = await clientEconomics();
  const totalRevenue = economics.reduce((sum, c) => sum + c.monthRevenue, 0);

  // 1 — Revenue concentration.
  const top = economics[0];
  if (!top || totalRevenue <= 0) {
    findings.push({
      key: "concentration",
      title: "No active revenue recorded",
      detail: "Nothing to concentrate. Add clients with values to make this meaningful.",
      severity: "warning",
      metric: "—",
      action: "Add your active clients and their retainer values.",
    });
  } else {
    const share = (top.monthRevenue / totalRevenue) * 100;
    const severity = share >= 50 ? "critical" : share >= 35 ? "serious" : share >= 25 ? "warning" : "good";
    findings.push({
      key: "concentration",
      title: `${top.name} is ${share.toFixed(0)}% of this month's revenue`,
      detail:
        severity === "good"
          ? "No single client dominates the book."
          : `Losing them costs ${share.toFixed(0)}% of revenue in one notice period.`,
      severity,
      metric: `${share.toFixed(0)}%`,
      action:
        severity === "good"
          ? "Nothing to do."
          : "Get the next two accounts up, or lock a longer term with them.",
    });
  }

  // 2 — Invoices that never went out. Invoicing lives in Zoho, so the risk
  // Cortex can actually see is the raise that was never marked: a missed
  // month is revenue nobody asked to be paid.
  const tasks = await billingTasks("founder", today);
  const currentMonth = today.slice(0, 7);
  const unraised = tasks.filter(
    (task) => !task.raised && (task.month < currentMonth || task.days < 0),
  );
  const missedMonth = unraised.filter((task) => task.month < currentMonth);
  const unraisedMrr = unraised.reduce((sum, task) => sum + (task.amount ?? 0), 0);
  const raiseSeverity =
    missedMonth.length >= 2
      ? "critical"
      : missedMonth.length === 1
        ? "serious"
        : unraised.length > 0
          ? "warning"
          : "good";
  findings.push({
    key: "unraised",
    title:
      unraised.length > 0
        ? `${unraised.length} invoice${unraised.length === 1 ? "" : "s"} not raised`
        : "Everything due is invoiced",
    detail:
      unraised.length > 0
        ? `${unraised.map((task) => task.clientName).join(", ")} — money nobody has been asked to pay yet.`
        : "Nothing is past its billing day unmarked, and last month closed clean.",
    severity: raiseSeverity,
    metric: unraised.length > 0 ? fmtCompact(unraisedMrr, defaultCurrency()) : "0",
    action:
      unraised.length > 0
        ? "Raise them in Zoho now, then mark them on the Invoices page."
        : "Nothing to do.",
  });
  const burn = await monthlyBurn();

  // 3 — Margin.
  const head = await headline();
  const marginSeverity =
    head.netMarginPct === null
      ? "warning"
      : head.netMarginPct < 0
        ? "critical"
        : head.netMarginPct < 15
          ? "serious"
          : head.netMarginPct < 30
            ? "warning"
            : "good";
  findings.push({
    key: "margin",
    title:
      head.netMarginPct === null
        ? "Margin can't be calculated yet"
        : head.netMarginPct < 0
          ? "Running at a loss"
          : `Net margin is ${head.netMarginPct.toFixed(0)}%`,
    detail:
      head.netMarginPct === null
        ? "No revenue recorded against the cost base."
        : "Monthly revenue against the full cost base, delivery and overhead together.",
    severity: marginSeverity,
    metric: head.netMarginPct === null ? "—" : `${head.netMarginPct.toFixed(0)}%`,
    action:
      marginSeverity === "good"
        ? "Nothing to do."
        : "Either the thin accounts get repriced or the cost base comes down.",
  });

  // 4 — Fixed-cost load. Salaries can't be switched off in a bad month.
  const totals = await costTotals();
  const fixed = totals
    .filter((t) => (["salary", "other"] as CostCategory[]).includes(t.category))
    .reduce((sum, t) => sum + t.total, 0);
  const fixedShare = burn > 0 ? (fixed / burn) * 100 : 0;
  const fixedSeverity = fixedShare >= 75 ? "serious" : fixedShare >= 60 ? "warning" : "good";
  findings.push({
    key: "fixed_costs",
    title: `${fixedShare.toFixed(0)}% of the cost base is fixed`,
    detail:
      fixedSeverity === "good"
        ? "Enough of the spend is variable to absorb a slow month."
        : "Salaries and overhead don't flex when revenue dips.",
    severity: fixedSeverity,
    metric: `${fixedShare.toFixed(0)}%`,
    action: fixedSeverity === "good" ? "Nothing to do." : "Keep more delivery on contractors until the book is deeper.",
  });

  // 5 — Accounts flagged as wobbling.
  const atRisk = economics.filter((c) => c.health === "red" || c.health === "amber");
  const atRiskRevenue = atRisk.reduce((sum, c) => sum + c.monthRevenue, 0);
  const atRiskShare = totalRevenue > 0 ? (atRiskRevenue / totalRevenue) * 100 : 0;
  const healthSeverity =
    atRiskShare >= 40 ? "critical" : atRiskShare >= 20 ? "serious" : atRiskShare > 0 ? "warning" : "good";
  findings.push({
    key: "health",
    title:
      atRisk.length === 0
        ? "Every account is healthy"
        : `${atRisk.length} account${atRisk.length === 1 ? "" : "s"} flagged, ${atRiskShare.toFixed(0)}% of revenue`,
    detail:
      atRisk.length === 0
        ? "Nothing flagged amber or red."
        : atRisk.map((c) => c.name).join(", "),
    severity: healthSeverity,
    metric: `${atRiskShare.toFixed(0)}%`,
    action: atRisk.length === 0 ? "Nothing to do." : "Book the calls this week, not next.",
  });

  // 6 — Revenue mix and the month ahead. Performance retainers start next
  // month on their own; creative one-offs land once and have to be re-sold.
  // Two signals share the finding: how much of this month is creative, and
  // whether next month's contracted book already falls short of this one.
  const projects = economics.filter((c) => c.engagement !== "retainer");
  const creativeRevenue = projects.reduce((sum, c) => sum + c.monthRevenue, 0);
  const creativeShare = totalRevenue > 0 ? (creativeRevenue / totalRevenue) * 100 : 0;
  const ahead = await projection(2);
  const nextMonth = ahead[1];
  const dropPct =
    totalRevenue > 0 && nextMonth
      ? ((totalRevenue - nextMonth.revenue) / totalRevenue) * 100
      : 0;

  const mixSeverity =
    dropPct >= 35 || creativeShare >= 60
      ? "serious"
      : dropPct >= 15 || creativeShare >= 40
        ? "warning"
        : "good";
  findings.push({
    key: "revenue_mix",
    title:
      creativeRevenue <= 0
        ? "All of this month's revenue is performance retainers"
        : `${creativeShare.toFixed(0)}% of this month's revenue is one-off creative work`,
    detail:
      dropPct >= 15 && nextMonth
        ? `Next month is contracted at ${fmtCompact(nextMonth.revenue, defaultCurrency())} — ${dropPct.toFixed(0)}% below this month. That gap is what has to be sold.`
        : creativeRevenue <= 0
          ? "Every active account is a retainer — next month starts where this one ended."
          : "Creative money lands once; the performance book is what next month starts with.",
    severity: mixSeverity,
    metric: creativeRevenue <= 0 ? "0%" : `${creativeShare.toFixed(0)}%`,
    action:
      mixSeverity === "good"
        ? "Nothing to do."
        : dropPct >= 15
          ? "Fill next month now: convert a creative client to a performance retainer, or close the next project before this one wraps."
          : "Convert the best creative clients to retainers, or keep the pipeline two projects deep.",
  });

  const score = Math.min(
    100,
    findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.severity], 0),
  );
  return {
    score,
    band: score >= 55 ? "exposed" : score >= 25 ? "watch" : "steady",
    findings,
  };
}

/* -------------------------------------------------------------------- P&L */

export type PnlMonth = {
  month: string;
  label: string;
  /** Contracted revenue in the month: retainers live in it, plus one-off
   *  projects kicking off in it — the same rule the invoices follow. */
  contracted: number;
  otherIncome: number;
  costs: number;
  oneOffCosts: number;
  revenue: number;
  profitBeforeTax: number;
  tax: number;
  /** The stored rate, as a percentage — kept so the editor round-trips it. */
  taxRatePct: number;
  profit: number;
  marginPct: number | null;
  closed: boolean;
  notes: string | null;
  /** False when the month has nothing in it — show "—", not zero. */
  hasData: boolean;
};

/**
 * With invoicing in Zoho, the P&L reads revenue off the book itself: each
 * month gets every retainer live in it, plus the whole value of every one-off
 * project that kicked off in it — the month its invoice went out. Churned
 * clients still count inside their dates — the month they earned in doesn't
 * un-happen — but a churned retainer with no end date is skipped rather than
 * counted forever, and an undated project counts in the current month only.
 */
export async function pnl(months = 12, endKey?: string): Promise<PnlMonth[]> {
  const keys = endKey ? lastMonths(months, endKey) : lastMonths(months);
  const currentKey = keys[keys.length - 1];
  const db = await getDb();

  const [contracts, manualRows] = await Promise.all([
    db.query<{
      status: string; engagement: string; retainer_amount: number;
      one_time_value: number; start_date: string | null; end_date: string | null;
    }>(
      `SELECT status, engagement, retainer_amount, one_time_value, start_date, end_date
       FROM foundery.clients`,
    ),
    db.query<{
      month: string; other_income: number; one_off_costs: number;
      tax_rate: number; notes: string | null; closed: boolean;
    }>(`SELECT * FROM foundery.pnl_months WHERE month = ANY($1)`, [keys]),
  ]);

  const manualBy = new Map(manualRows.map((row) => [row.month, row]));
  const monthCosts = await Promise.all(keys.map((month) => costsForMonth(month)));

  return keys.map((month, index) => {
    let contracted = 0;
    for (const row of contracts) {
      if (row.engagement === "retainer") {
        // A churned retainer with no recorded end can't be bounded — skip it
        // rather than count it forever.
        if (row.status === "churned" && !row.end_date) continue;
        contracted += revenueInMonth(row, month);
      } else {
        // A project lands in its kickoff month whatever its status today —
        // the month it was invoiced in doesn't un-happen. Undated projects
        // can't be placed historically, so they count in the current month
        // only, and not at all once churned.
        const undatedMonth =
          month === currentKey && row.status !== "churned" ? currentKey : null;
        contracted += revenueInMonth(row, month, undatedMonth);
      }
    }

    const manual = manualBy.get(month);
    const otherIncome = manual?.other_income ?? 0;
    const oneOffCosts = manual?.one_off_costs ?? 0;
    const costs = monthCosts[index] + oneOffCosts;
    const revenue = contracted + otherIncome;
    const profitBeforeTax = revenue - costs;
    const taxRate = manual?.tax_rate ?? 0;
    const tax = profitBeforeTax > 0 ? profitBeforeTax * taxRate : 0;

    return {
      month,
      label: monthLabel(month),
      contracted,
      otherIncome,
      costs,
      oneOffCosts,
      revenue,
      profitBeforeTax,
      tax,
      taxRatePct: taxRate * 100,
      profit: profitBeforeTax - tax,
      marginPct: revenue > 0 ? ((profitBeforeTax - tax) / revenue) * 100 : null,
      closed: manual?.closed === true,
      notes: manual?.notes ?? null,
      hasData: contracted > 0 || costs > 0 || otherIncome > 0,
    };
  });
}

export function pnlTotals(rows: PnlMonth[]) {
  const live = rows.filter((r) => r.hasData);
  const revenue = live.reduce((sum, r) => sum + r.revenue, 0);
  const costs = live.reduce((sum, r) => sum + r.costs, 0);
  const tax = live.reduce((sum, r) => sum + r.tax, 0);
  const profit = live.reduce((sum, r) => sum + r.profit, 0);
  return {
    revenue,
    costs,
    tax,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : null,
    months: live.length,
    bestMonth: live.length ? live.reduce((a, b) => (b.profit > a.profit ? b : a)) : null,
    worstMonth: live.length ? live.reduce((a, b) => (b.profit < a.profit ? b : a)) : null,
  };
}
