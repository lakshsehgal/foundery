import "server-only";
import { getDb, getSetting } from "./db";
import { costsForMonth, costTotals, monthlyBurn } from "./queries";
import { lastMonths, monthKey, monthLabel, todayISO } from "./dates";
import type { CostCategory, Health } from "./taxonomy";
import { marginPct, spreadProject } from "./economics";

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
  /** When the contract ends — the project-cliff maths reads this. */
  endDate: string | null;
  /** Monthly recognised revenue. A project is spread over its live months. */
  mrr: number;
  deliveryCost: number;
  grossProfit: number;
  /** null rather than a confident 0 when there is no revenue to divide by. */
  marginPct: number | null;
  shareOfRevenuePct: number;
};

export async function clientEconomics(): Promise<ClientEconomics[]> {
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
    const mrr =
      row.engagement === "retainer"
        ? row.retainer_amount
        : spreadProject(row.one_time_value, row.start_date, row.end_date);
    const grossProfit = mrr - row.delivery_cost;
    return {
      id: row.id,
      name: row.name,
      vip: row.vip,
      engagement: row.engagement,
      health: row.health as Health,
      endDate: row.end_date,
      mrr,
      deliveryCost: row.delivery_cost,
      grossProfit,
      marginPct: marginPct(mrr, row.delivery_cost),
      shareOfRevenuePct: 0,
    };
  });

  const total = priced.reduce((sum, c) => sum + c.mrr, 0);
  for (const client of priced) {
    client.shareOfRevenuePct = total > 0 ? (client.mrr / total) * 100 : 0;
  }
  return priced.sort((a, b) => b.mrr - a.mrr);
}

/* --------------------------------------------------------------- headline */

export type Headline = {
  mrr: number;
  /** The part of mrr that renews by itself: retainers only. */
  recurring: number;
  /** The part that stops when the work ships: one-off projects, spread monthly. */
  project: number;
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
  const mrr = economics.reduce((sum, c) => sum + c.mrr, 0);
  const retainers = economics.filter((c) => c.engagement === "retainer");
  const recurring = retainers.reduce((sum, c) => sum + c.mrr, 0);
  const deliveryCost = economics.reduce((sum, c) => sum + c.deliveryCost, 0);
  const netProfit = mrr - burn;
  const cashBuffer = bufferRaw === "" ? null : Number(bufferRaw);

  return {
    mrr,
    recurring,
    project: mrr - recurring,
    retainerClients: retainers.length,
    projectClients: economics.length - retainers.length,
    burn,
    grossProfit: mrr - deliveryCost,
    netProfit,
    netMarginPct: mrr > 0 ? (netProfit / mrr) * 100 : null,
    deliveryCost,
    activeClients: economics.length,
    vipClients: economics.filter((c) => c.vip).length,
    runwayMonths:
      cashBuffer !== null && burn > 0 ? cashBuffer / burn : null,
    cashBuffer,
  };
}

/* ------------------------------------------------------------- projection */

export type ProjectedMonth = {
  month: string;
  label: string;
  revenue: number;
  /** Retainer revenue in the month — the part that renews by itself. */
  recurring: number;
  /** One-off project revenue in the month — the part that ends. */
  project: number;
  costs: number;
  profit: number;
  /** Confidence shrinks the further out we look. */
  confidence: "booked" | "likely" | "assumed";
};

/**
 * Forward revenue from contracts that already exist — no growth assumption
 * baked in. A retainer counts until its end date; a project stops when it
 * ships. Anything past a client's end date simply isn't there, which is the
 * point: the shape of the curve shows the cliff before it arrives.
 */
export async function projection(months = 6): Promise<ProjectedMonth[]> {
  const db = await getDb();
  const rows = await db.query<{
    engagement: string; retainer_amount: number; one_time_value: number;
    start_date: string | null; end_date: string | null;
  }>(
    `SELECT engagement, retainer_amount, one_time_value, start_date, end_date
     FROM foundery.clients WHERE status IN ('active','paused')`,
  );

  const burn = await monthlyBurn();
  const start = new Date();
  const out: ProjectedMonth[] = [];

  for (let i = 0; i < months; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const key = monthKey(date);
    let recurring = 0;
    let project = 0;
    for (const row of rows) {
      if (row.end_date && row.end_date.slice(0, 7) < key) continue;
      if (row.start_date && row.start_date.slice(0, 7) > key) continue;
      if (row.engagement === "retainer") {
        recurring += row.retainer_amount;
      } else {
        project += spreadProject(row.one_time_value, row.start_date, row.end_date);
      }
    }
    const revenue = recurring + project;
    out.push({
      month: key,
      label: monthLabel(key),
      revenue,
      recurring,
      project,
      costs: burn,
      profit: revenue - burn,
      confidence: i === 0 ? "booked" : i <= 2 ? "likely" : "assumed",
    });
  }
  return out;
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
  const db = await getDb();
  const economics = await clientEconomics();
  const totalMrr = economics.reduce((sum, c) => sum + c.mrr, 0);

  // 1 — Revenue concentration.
  const top = economics[0];
  if (!top || totalMrr <= 0) {
    findings.push({
      key: "concentration",
      title: "No active revenue recorded",
      detail: "Nothing to concentrate. Add clients with values to make this meaningful.",
      severity: "warning",
      metric: "—",
      action: "Add your active clients and their retainer values.",
    });
  } else {
    const share = (top.mrr / totalMrr) * 100;
    const severity = share >= 50 ? "critical" : share >= 35 ? "serious" : share >= 25 ? "warning" : "good";
    findings.push({
      key: "concentration",
      title: `${top.name} is ${share.toFixed(0)}% of monthly revenue`,
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

  // 2 — Money owed and late.
  const [receivables] = await db.query<{
    outstanding: number; overdue: number; overduecount: number;
  }>(
    `SELECT COALESCE(SUM(amount - amount_paid), 0) AS outstanding,
            COALESCE(SUM(CASE WHEN due_date < $1 THEN amount - amount_paid ELSE 0 END), 0) AS overdue,
            COUNT(CASE WHEN due_date < $1 AND status NOT IN ('paid','void') THEN 1 END) AS overdueCount
     FROM foundery.invoices WHERE status NOT IN ('paid','void')`,
    [today],
  );

  // Postgres folds unquoted identifiers to lower case, so overdueCount comes
  // back as overduecount.
  const overdueCount = Number(receivables.overduecount);
  const burn = await monthlyBurn();
  const overdueMonths = burn > 0 ? receivables.overdue / burn : 0;
  const receivableSeverity =
    overdueMonths >= 1 ? "critical" : overdueMonths >= 0.5 ? "serious" : receivables.overdue > 0 ? "warning" : "good";
  findings.push({
    key: "receivables",
    title:
      overdueCount > 0
        ? `${overdueCount} invoice${overdueCount === 1 ? "" : "s"} past due`
        : "Nothing overdue",
    detail:
      receivables.overdue > 0
        ? `That is ${overdueMonths.toFixed(1)} months of running costs sitting in someone else's account.`
        : "Everything raised is either paid or still inside terms.",
    severity: receivableSeverity,
    metric: receivables.overdue > 0 ? `${overdueMonths.toFixed(1)}× burn` : "0",
    action: receivables.overdue > 0 ? "Chase the oldest one today, before the newest." : "Nothing to do.",
  });

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
  const atRiskMrr = atRisk.reduce((sum, c) => sum + c.mrr, 0);
  const atRiskShare = totalMrr > 0 ? (atRiskMrr / totalMrr) * 100 : 0;
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

  // 6 — Revenue mix. A retainer renews by itself; a project has to be re-sold.
  // Two signals share the finding: how much of the book is one-off work, and
  // how much of that one-off revenue disappears inside the next 60 days.
  const projects = economics.filter((c) => c.engagement !== "retainer");
  const projectMrr = projects.reduce((sum, c) => sum + c.mrr, 0);
  const projectShare = totalMrr > 0 ? (projectMrr / totalMrr) * 100 : 0;
  const horizon = new Date(today);
  horizon.setDate(horizon.getDate() + 60);
  const horizonISO = horizon.toISOString().slice(0, 10);
  const endingSoon = projects.filter((c) => c.endDate !== null && c.endDate <= horizonISO);
  const endingSoonMrr = endingSoon.reduce((sum, c) => sum + c.mrr, 0);
  const cliffShare = totalMrr > 0 ? (endingSoonMrr / totalMrr) * 100 : 0;

  const mixSeverity =
    cliffShare >= 25 || projectShare >= 60
      ? "serious"
      : cliffShare >= 10 || projectShare >= 40
        ? "warning"
        : "good";
  findings.push({
    key: "revenue_mix",
    title:
      projectMrr <= 0
        ? "All revenue is recurring"
        : `${projectShare.toFixed(0)}% of revenue is one-off project work`,
    detail:
      projectMrr <= 0
        ? "Every active account is on a retainer — next month starts where this one ended."
        : endingSoon.length > 0
          ? `${endingSoon.map((c) => c.name).join(", ")} ship${endingSoon.length === 1 ? "s" : ""} within 60 days — ${cliffShare.toFixed(0)}% of revenue with nothing behind it yet.`
          : "Project work is fine money, but every rupee of it has to be re-sold when it ships.",
    severity: mixSeverity,
    metric: projectMrr <= 0 ? "0%" : `${projectShare.toFixed(0)}%`,
    action:
      mixSeverity === "good"
        ? "Nothing to do."
        : endingSoon.length > 0
          ? "Pitch the retainer conversion before the project wraps, not after."
          : "Convert the best project clients to retainers, or keep the pipeline two projects deep.",
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
  /** Everything invoiced with an issue date in the month. */
  invoiced: number;
  /** Everything actually banked in the month. */
  collected: number;
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
  /** False when the month has no invoices and no costs — show "—", not zero. */
  hasData: boolean;
};

export async function pnl(
  months = 12,
  basis: "invoiced" | "collected" = "invoiced",
): Promise<PnlMonth[]> {
  const keys = lastMonths(months);
  const db = await getDb();

  // Both revenue sides and every manual row in three queries rather than
  // three per month — a serverless round trip to Supabase is not free.
  const [invoicedRows, collectedRows, manualRows] = await Promise.all([
    db.query<{ month: string; total: number }>(
      `SELECT to_char(issue_date, 'YYYY-MM') AS month, COALESCE(SUM(amount), 0) AS total
       FROM foundery.invoices
       WHERE status <> 'void' AND to_char(issue_date, 'YYYY-MM') = ANY($1)
       GROUP BY 1`,
      [keys],
    ),
    db.query<{ month: string; total: number }>(
      `SELECT to_char(paid_date, 'YYYY-MM') AS month, COALESCE(SUM(amount_paid), 0) AS total
       FROM foundery.invoices
       WHERE status <> 'void' AND paid_date IS NOT NULL
         AND to_char(paid_date, 'YYYY-MM') = ANY($1)
       GROUP BY 1`,
      [keys],
    ),
    db.query<{
      month: string; other_income: number; one_off_costs: number;
      tax_rate: number; notes: string | null; closed: boolean;
    }>(`SELECT * FROM foundery.pnl_months WHERE month = ANY($1)`, [keys]),
  ]);

  const invoicedBy = new Map(invoicedRows.map((row) => [row.month, Number(row.total)]));
  const collectedBy = new Map(collectedRows.map((row) => [row.month, Number(row.total)]));
  const manualBy = new Map(manualRows.map((row) => [row.month, row]));
  const monthCosts = await Promise.all(keys.map((month) => costsForMonth(month)));

  return keys.map((month, index) => {
    const invoiced = invoicedBy.get(month) ?? 0;
    const collected = collectedBy.get(month) ?? 0;
    const manual = manualBy.get(month);

    const otherIncome = manual?.other_income ?? 0;
    const oneOffCosts = manual?.one_off_costs ?? 0;
    const costs = monthCosts[index] + oneOffCosts;
    const revenue = (basis === "invoiced" ? invoiced : collected) + otherIncome;
    const profitBeforeTax = revenue - costs;
    const taxRate = manual?.tax_rate ?? 0;
    const tax = profitBeforeTax > 0 ? profitBeforeTax * taxRate : 0;

    return {
      month,
      label: monthLabel(month),
      invoiced,
      collected,
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
      hasData: invoiced > 0 || collected > 0 || costs > 0 || otherIncome > 0,
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
