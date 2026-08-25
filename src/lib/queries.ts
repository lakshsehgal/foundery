import "server-only";
import { getDb } from "./db";
import type { Role } from "./session";
import { policyFor } from "./policy";
import { monthlyEquivalent } from "./money";
import { billingDateFor, daysUntil, lastMonths, monthLabel, todayISO } from "./dates";
import type {
  ClientStatus, CostCategory, Engagement, Health, OnboardingField,
  OnboardingFlow,
} from "./taxonomy";
import { CATEGORY_LABEL, COST_CATEGORIES } from "./taxonomy";

/* --------------------------------------------------------------- clients */

/** The shape that reaches a page. Money fields are null when redacted. */
export type ClientView = {
  id: number;
  name: string;
  slug: string;
  status: ClientStatus;
  engagement: Engagement;
  vip: boolean;
  services: string[];
  owner: string | null;
  start_date: string | null;
  end_date: string | null;
  billing_day: number;
  terms_days: number;
  currency: string;
  notes: string | null;
  /** null = the signed-in role isn't cleared for it. */
  retainer_amount: number | null;
  one_time_value: number | null;
  delivery_cost: number | null;
  health: Health | null;
  zoho_name: string | null;
};

type ClientRow = {
  id: number; name: string; slug: string; status: string; engagement: string;
  vip: boolean; services: unknown; owner: string | null; start_date: string | null;
  end_date: string | null; billing_day: number; terms_days: number; currency: string;
  notes: string | null; retainer_amount: number; one_time_value: number;
  delivery_cost: number; health: string; zoho_name: string | null;
};

/** jsonb arrives already parsed; anything else is treated as empty. */
function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is string => typeof entry === "string");
}

function toClientView(row: ClientRow, showValues: boolean): ClientView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as ClientStatus,
    engagement: row.engagement as Engagement,
    vip: row.vip,
    services: toStringArray(row.services),
    owner: row.owner,
    start_date: row.start_date,
    end_date: row.end_date,
    billing_day: row.billing_day,
    terms_days: row.terms_days,
    currency: row.currency,
    notes: row.notes,
    retainer_amount: showValues ? row.retainer_amount : null,
    one_time_value: showValues ? row.one_time_value : null,
    delivery_cost: showValues ? row.delivery_cost : null,
    health: showValues ? (row.health as Health) : null,
    zoho_name: showValues ? (row.zoho_name ?? null) : null,
  };
}

export async function listClients(role: Role): Promise<ClientView[]> {
  const [{ clientValues }, db] = await Promise.all([policyFor(role), getDb()]);
  const rows = await db.query<ClientRow>(
    `SELECT * FROM foundery.clients
     ORDER BY (status = 'active') DESC, vip DESC, lower(name)`,
  );
  return rows.map((row) => toClientView(row, clientValues));
}

export async function getClient(role: Role, id: number): Promise<ClientView | null> {
  const [{ clientValues }, db] = await Promise.all([policyFor(role), getDb()]);
  const rows = await db.query<ClientRow>(`SELECT * FROM foundery.clients WHERE id = $1`, [id]);
  return rows[0] ? toClientView(rows[0], clientValues) : null;
}

/** Names and ids only — safe for any role, used to populate pickers. */
export async function clientOptions(): Promise<
  { id: number; name: string; terms_days: number; billing_day: number }[]
> {
  const db = await getDb();
  return db.query(
    `SELECT id, name, terms_days, billing_day FROM foundery.clients
     WHERE status <> 'churned' ORDER BY lower(name)`,
  );
}

/* ----------------------------------------------------------------- costs */

export type CostView = {
  id: number | null;
  category: CostCategory;
  label: string;
  person: string | null;
  /** null when the amount belongs to a redacted line item. */
  amount: number | null;
  cadence: string;
  monthly: number | null;
  currency: string;
  active: boolean;
  start_date: string | null;
  end_date: string | null;
  notes: string | null;
  client_id: number | null;
  /** True when this row stands in for several rows the role can't itemise. */
  aggregated: boolean;
  /** How many real rows the aggregate covers. */
  count: number;
  editable: boolean;
};

type CostRow = {
  id: number; category: string; label: string; person: string | null; amount: number;
  cadence: string; currency: string; start_date: string | null; end_date: string | null;
  active: boolean; client_id: number | null; notes: string | null;
};

/**
 * Cost lines for the signed-in role.
 *
 * For a category the role can't itemise (salaries, for an operator) the rows
 * are collapsed into one aggregate line carrying the category total and a
 * headcount. Individual amounts and names are dropped before the data leaves
 * this function, so they never reach the browser at all.
 */
export async function listCosts(
  role: Role,
  opts: { includeInactive?: boolean } = {},
): Promise<CostView[]> {
  const [policy, db] = await Promise.all([policyFor(role), getDb()]);
  const rows = await db.query<CostRow>(
    `SELECT * FROM foundery.costs
     ${opts.includeInactive ? "" : "WHERE active"}
     ORDER BY category, amount DESC`,
  );

  const out: CostView[] = [];
  const collapsed = new Map<CostCategory, { total: number; count: number; currency: string }>();

  for (const row of rows) {
    const category = row.category as CostCategory;
    const monthly = monthlyEquivalent(row.amount, row.cadence);
    if (policy.costLineItems(category)) {
      out.push({
        id: row.id,
        category,
        label: row.label,
        person: row.person,
        amount: row.amount,
        cadence: row.cadence,
        monthly,
        currency: row.currency,
        active: row.active,
        start_date: row.start_date,
        end_date: row.end_date,
        notes: row.notes,
        client_id: row.client_id,
        aggregated: false,
        count: 1,
        editable: true,
      });
    } else {
      const bucket = collapsed.get(category) ?? { total: 0, count: 0, currency: row.currency };
      bucket.total += monthly;
      bucket.count += 1;
      collapsed.set(category, bucket);
    }
  }

  for (const [category, bucket] of collapsed) {
    out.push({
      id: null,
      category,
      label: `${CATEGORY_LABEL[category]} — ${bucket.count} ${bucket.count === 1 ? "person" : "people"}`,
      person: null,
      // The category total IS visible; the split across people is not.
      amount: bucket.total,
      cadence: "monthly",
      monthly: bucket.total,
      currency: bucket.currency,
      active: true,
      start_date: null,
      end_date: null,
      notes: null,
      client_id: null,
      aggregated: true,
      count: bucket.count,
      editable: false,
    });
  }

  const order = COST_CATEGORIES.map((definition) => definition.key);
  return out.sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (b.monthly ?? 0) - (a.monthly ?? 0),
  );
}

/** Monthly run-rate per category. Visible in full to both roles. */
export async function costTotals(): Promise<
  { category: CostCategory; total: number; count: number }[]
> {
  const db = await getDb();
  const rows = await db.query<{ category: string; amount: number; cadence: string }>(
    `SELECT category, amount, cadence FROM foundery.costs WHERE active`,
  );

  const map = new Map<CostCategory, { total: number; count: number }>();
  for (const definition of COST_CATEGORIES) map.set(definition.key, { total: 0, count: 0 });
  for (const row of rows) {
    const key = row.category as CostCategory;
    const bucket = map.get(key) ?? { total: 0, count: 0 };
    bucket.total += monthlyEquivalent(row.amount, row.cadence);
    bucket.count += 1;
    map.set(key, bucket);
  }
  return COST_CATEGORIES.map((definition) => ({
    category: definition.key,
    ...map.get(definition.key)!,
  }));
}

export async function monthlyBurn(): Promise<number> {
  const totals = await costTotals();
  return totals.reduce((sum, row) => sum + row.total, 0);
}

/**
 * What the cost base actually was in a given month — used by the P&L, where
 * today's run-rate would be the wrong number for a month six months ago.
 */
export async function costsForMonth(month: string): Promise<number> {
  const db = await getDb();
  const start = `${month}-01`;
  const end = billingDateFor(month, 31);

  const rows = await db.query<{ amount: number; cadence: string }>(
    `SELECT amount, cadence FROM foundery.costs
     WHERE (start_date IS NULL OR start_date <= $1)
       AND (end_date   IS NULL OR end_date   >= $2)`,
    [end, start],
  );
  const recurring = rows.reduce((sum, row) => sum + monthlyEquivalent(row.amount, row.cadence), 0);

  const [oneOffs] = await db.query<{ total: number }>(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM foundery.costs
     WHERE cadence = 'one_time' AND start_date >= $1 AND start_date <= $2`,
    [start, end],
  );

  return recurring + Number(oneOffs?.total ?? 0);
}

/* --------------------------------------------------------------- billing */

/**
 * Invoicing happens in Zoho Books; Cortex only tracks whether each month's
 * retainer invoice has been raised there. A task exists for every active
 * retainer for the previous and current month; a mark in raised_invoices is
 * what closes it.
 */
export type BillingTask = {
  clientId: number;
  clientName: string;
  vip: boolean;
  month: string; // 'YYYY-MM'
  monthLabel: string;
  billingDay: number;
  /** The date the invoice should go out — billing day clamped to the month. */
  raiseOn: string;
  /** Negative = the billing date is that many days past. */
  days: number;
  raised: boolean;
  raisedAt: string | null;
  /** Retainer size — null when the role isn't cleared for client values. */
  amount: number | null;
  currency: string;
};

export async function billingTasks(role: Role, today = todayISO()): Promise<BillingTask[]> {
  const [{ clientValues }, db] = await Promise.all([policyFor(role), getDb()]);
  const months = lastMonths(2, today.slice(0, 7)); // [previous, current]

  const clients = await db.query<{
    id: number; name: string; vip: boolean; billing_day: number;
    retainer_amount: number; currency: string; start_date: string | null;
  }>(
    `SELECT id, name, vip, billing_day, retainer_amount, currency, start_date
     FROM foundery.clients
     WHERE status = 'active' AND engagement = 'retainer'
     ORDER BY billing_day ASC, name ASC`,
  );

  let marks: { client_id: number; month: string; raised_at: string }[] = [];
  try {
    marks = await db.query(
      `SELECT client_id, month, raised_at FROM foundery.raised_invoices WHERE month = ANY($1)`,
      [months],
    );
  } catch {
    // The table ships in db/schema.sql. Until it's applied, every task simply
    // reads as unraised; marking one reports the fix by name.
    console.warn("foundery.raised_invoices missing — run db/schema.sql to enable invoice marks");
  }
  const marked = new Map(marks.map((mark) => [`${mark.client_id}:${mark.month}`, mark.raised_at]));

  const out: BillingTask[] = [];
  for (const month of months) {
    for (const client of clients) {
      // A retainer that hadn't started yet owes nothing for that month.
      if (client.start_date && client.start_date.slice(0, 7) > month) continue;
      const raiseOn = billingDateFor(month, client.billing_day);
      const raisedAt = marked.get(`${client.id}:${month}`) ?? null;
      out.push({
        clientId: client.id,
        clientName: client.name,
        vip: client.vip,
        month,
        monthLabel: monthLabel(month),
        billingDay: client.billing_day,
        raiseOn,
        days: daysUntil(raiseOn, today),
        raised: raisedAt !== null,
        raisedAt: raisedAt ? String(raisedAt).slice(0, 10) : null,
        amount: clientValues ? client.retainer_amount : null,
        currency: client.currency,
      });
    }
  }
  return out;
}

/**
 * The reminder feed: retainer invoices still to be raised in Zoho. A missed
 * month outranks this month's list, and inside a month the most overdue
 * billing day comes first.
 */
export type Reminder = {
  kind: "missed" | "to_raise";
  title: string;
  detail: string;
  clientName: string;
  vip: boolean;
  amount: number | null;
  currency: string;
  /** The date the invoice should have gone out. */
  raiseOn: string;
  days: number;
  month: string;
  clientId: number;
};

export async function reminders(role: Role, today = todayISO()): Promise<Reminder[]> {
  const tasks = await billingTasks(role, today);
  const currentMonth = today.slice(0, 7);
  const out: Reminder[] = [];

  for (const task of tasks) {
    if (task.raised) continue;
    const base = {
      clientName: task.clientName,
      vip: task.vip,
      amount: task.amount,
      currency: task.currency,
      raiseOn: task.raiseOn,
      days: task.days,
      month: task.month,
      clientId: task.clientId,
    };
    if (task.month < currentMonth) {
      out.push({
        kind: "missed",
        title: `${task.clientName}'s ${task.monthLabel} invoice was never raised`,
        detail: "The whole month went by without a mark. Raise it in Zoho, then tick it off.",
        ...base,
      });
    } else if (task.days <= 3) {
      // Surface this month's raises from three days ahead of the billing date.
      out.push({
        kind: "to_raise",
        title:
          task.days < 0
            ? `${task.clientName}'s retainer invoice is ${Math.abs(task.days)} ${Math.abs(task.days) === 1 ? "day" : "days"} late going out`
            : `Raise ${task.clientName}'s retainer invoice`,
        detail: `Billing day ${task.billingDay} — not yet marked raised for ${task.monthLabel}.`,
        ...base,
      });
    }
  }

  const rank = { missed: 0, to_raise: 1 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.days - b.days);
}

/* ------------------------------------------------------------ onboarding */

export type FormView = {
  id: number;
  title: string;
  intro: string | null;
  token: string;
  client_id: number | null;
  client_name: string | null;
  fields: OnboardingField[];
  status: "open" | "closed";
  created_at: string;
  created_by: string;
  submissions: number;
  lastSubmission: string | null;
};

function toFields(value: unknown): OnboardingField[] {
  return Array.isArray(value) ? (value as OnboardingField[]) : [];
}

export async function listForms(): Promise<FormView[]> {
  const db = await getDb();
  const rows = await db.query<
    Omit<FormView, "fields" | "submissions" | "lastSubmission"> & {
      fields: unknown; submissions: number; last_submission: string | null;
    }
  >(
    `SELECT f.*, c.name AS client_name,
            (SELECT COUNT(*) FROM foundery.onboarding_submissions s WHERE s.form_id = f.id) AS submissions,
            (SELECT MAX(submitted_at) FROM foundery.onboarding_submissions s WHERE s.form_id = f.id) AS last_submission
     FROM foundery.onboarding_forms f
     LEFT JOIN foundery.clients c ON c.id = f.client_id
     ORDER BY f.created_at DESC`,
  );

  return rows.map((row) => ({
    ...row,
    fields: toFields(row.fields),
    submissions: row.submissions,
    lastSubmission: row.last_submission,
  }));
}

export async function getFormByToken(token: string): Promise<FormView | null> {
  const db = await getDb();
  const rows = await db.query<FormView & { fields: unknown }>(
    `SELECT f.*, c.name AS client_name, 0 AS submissions, NULL AS last_submission
     FROM foundery.onboarding_forms f
     LEFT JOIN foundery.clients c ON c.id = f.client_id
     WHERE f.token = $1`,
    [token],
  );
  const row = rows[0];
  if (!row) return null;
  return { ...row, fields: toFields(row.fields), submissions: 0, lastSubmission: null };
}

export type SubmissionView = {
  id: number;
  form_id: number;
  form_title: string;
  client_name: string | null;
  answers: Record<string, string>;
  fields: OnboardingField[];
  submitted_at: string;
};

export async function listSubmissions(formId?: number): Promise<SubmissionView[]> {
  const db = await getDb();
  const rows = await db.query<{
    id: number; form_id: number; answers: unknown; submitted_at: string;
    form_title: string; fields: unknown; client_name: string | null;
  }>(
    `SELECT s.id, s.form_id, s.answers, s.submitted_at,
            f.title AS form_title, f.fields AS fields, c.name AS client_name
     FROM foundery.onboarding_submissions s
     JOIN foundery.onboarding_forms f ON f.id = s.form_id
     LEFT JOIN foundery.clients c ON c.id = f.client_id
     ${formId ? "WHERE s.form_id = $1" : ""}
     ORDER BY s.submitted_at DESC`,
    formId ? [formId] : [],
  );

  return rows.map((row) => ({
    id: row.id,
    form_id: row.form_id,
    form_title: row.form_title,
    client_name: row.client_name,
    answers:
      row.answers && typeof row.answers === "object" && !Array.isArray(row.answers)
        ? (row.answers as Record<string, string>)
        : {},
    fields: toFields(row.fields),
    submitted_at: row.submitted_at,
  }));
}

export function publicFormUrl(token: string): string {
  const base = (
    process.env.FOUNDERY_PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${base}/onboard/${token}`;
}

/* ---------------------------------------------------- guided onboardings */

export type GuidedOnboarding = {
  id: number;
  client_id: number;
  client_name: string;
  token: string;
  flow: OnboardingFlow;
  status: "invited" | "details_done" | "completed";
  details: Record<string, string>;
  access: Record<string, { done: boolean; note?: string }>;
  created_at: string;
  completed_at: string | null;
};

function toRecord<T>(value: unknown): Record<string, T> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, T>)
    : {};
}

function toGuided(row: {
  id: number; client_id: number; client_name: string; token: string; flow?: string;
  status: string; details: unknown; access: unknown; created_at: string;
  completed_at: string | null;
}): GuidedOnboarding {
  return {
    ...row,
    flow: row.flow === "creative" ? "creative" : "performance",
    status: row.status as GuidedOnboarding["status"],
    details: toRecord<string>(row.details),
    access: toRecord<{ done: boolean; note?: string }>(row.access),
  };
}

/**
 * Selected with and without the flow column: a database that predates flows
 * (the column ships in db/schema.sql) still serves its onboardings, all read
 * as performance, instead of taking the page down.
 */
function guidedSelect(withFlow: boolean, where = ""): string {
  return `SELECT o.id, o.client_id, c.name AS client_name, o.token, ${
    withFlow ? "o.flow," : ""
  } o.status, o.details, o.access, o.created_at, o.completed_at
     FROM foundery.onboardings o
     JOIN foundery.clients c ON c.id = o.client_id ${where}`;
}

export async function listGuidedOnboardings(): Promise<GuidedOnboarding[]> {
  const db = await getDb();
  const order = "ORDER BY o.created_at DESC";
  try {
    const rows = await db.query<Parameters<typeof toGuided>[0]>(guidedSelect(true, order));
    return rows.map(toGuided);
  } catch {
    try {
      const rows = await db.query<Parameters<typeof toGuided>[0]>(guidedSelect(false, order));
      return rows.map(toGuided);
    } catch {
      // The table ships in db/schema.sql; a database that hasn't had the
      // updated schema applied yet shouldn't take the clients page down with
      // it. Empty until `npm run db:setup` (or the SQL editor) catches up.
      console.warn("foundery.onboardings missing — re-run db/schema.sql to enable guided onboarding");
      return [];
    }
  }
}

export async function getGuidedByToken(token: string): Promise<GuidedOnboarding | null> {
  const db = await getDb();
  const where = "WHERE o.token = $1";
  try {
    const rows = await db.query<Parameters<typeof toGuided>[0]>(guidedSelect(true, where), [token]);
    return rows[0] ? toGuided(rows[0]) : null;
  } catch {
    try {
      const rows = await db.query<Parameters<typeof toGuided>[0]>(guidedSelect(false, where), [token]);
      return rows[0] ? toGuided(rows[0]) : null;
    } catch {
      return null;
    }
  }
}

export function publicWelcomeUrl(token: string): string {
  const base = (
    process.env.FOUNDERY_PUBLIC_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : "http://localhost:3000")
  ).replace(/\/$/, "");
  return `${base}/welcome/${token}`;
}
