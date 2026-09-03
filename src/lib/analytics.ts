import "server-only";
import { getDb, getSetting } from "./db";
import { billingTasks, costsForMonth, costTotals, monthlyBurn } from "./queries";
import { defaultCurrency, fmtCompact } from "./money";
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
    revenuePerHead: headcount > 0 ? head.mrr / headcount : null,
    profitPerHead: headcount > 0 ? head.netProfit / headcount : null,
    payrollSharePct: head.mrr > 0 ? (payroll / head.mrr) * 100 : null,
    deliverySharePct: head.mrr > 0 ? (head.deliveryCost / head.mrr) * 100 : null,
    avgClientValue: head.activeClients > 0 ? head.mrr / head.activeClients : null,
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
  /** Contracted revenue in the month: retainers plus spread project slices. */
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
 * month gets every retainer live in it plus each project's monthly slice,
 * bounded by the contract's dates. Churned clients still count inside their
 * dates — the month they earned in doesn't un-happen — but a churned client
 * with no end date recorded is skipped rather than counted forever.
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
      if (row.status === "churned" && !row.end_date) continue;
      if (row.end_date && row.end_date.slice(0, 7) < month) continue;
      if (row.start_date && row.start_date.slice(0, 7) > month) continue;
      if (row.engagement === "retainer") {
        contracted += row.retainer_amount;
      } else if (row.start_date || row.end_date) {
        contracted += spreadProject(row.one_time_value, row.start_date, row.end_date);
      } else if (month === currentKey) {
        // An undated project can't be placed historically — count its monthly
        // slice in the current month only rather than in every month forever.
        contracted += spreadProject(row.one_time_value, null, null);
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
