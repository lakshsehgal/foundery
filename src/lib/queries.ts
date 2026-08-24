import "server-only";
import { getDb } from "./db";
import type { Role } from "./session";
import { policyFor } from "./policy";
import { monthlyEquivalent } from "./money";
import { billingDateFor, daysUntil, monthKey, todayISO, addDays } from "./dates";
import type {
  ClientStatus, CostCategory, Engagement, Health, InvoiceStatus, OnboardingField,
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

/* -------------------------------------------------------------- invoices */

export type InvoiceView = {
  id: number;
  client_id: number;
  client_name: string;
  vip: boolean;
  number: string;
  period: string | null;
  issue_date: string;
  due_date: string;
  terms_days: number;
  amount: number | null;
  amount_paid: number | null;
  outstanding: number | null;
  currency: string;
  status: InvoiceStatus;
  paid_date: string | null;
  notes: string | null;
  /** Negative = overdue by N days. Null once paid or void. */
  daysUntilDue: number | null;
  overdue: boolean;
};

type InvoiceRow = {
  id: number; client_id: number; client_name: string; vip: boolean; number: string;
  period: string | null; issue_date: string; due_date: string; terms_days: number;
  amount: number; amount_paid: number; currency: string; status: string;
  paid_date: string | null; notes: string | null;
};

function toInvoiceView(row: InvoiceRow, showAmounts: boolean, today: string): InvoiceView {
  const settled = row.status === "paid" || row.status === "void";
  const days = settled ? null : daysUntil(row.due_date, today);
  return {
    id: row.id,
    client_id: row.client_id,
    client_name: row.client_name,
    vip: row.vip,
    number: row.number,
    period: row.period,
    issue_date: row.issue_date,
    due_date: row.due_date,
    terms_days: row.terms_days,
    amount: showAmounts ? row.amount : null,
    amount_paid: showAmounts ? row.amount_paid : null,
    outstanding: showAmounts ? Math.max(0, row.amount - row.amount_paid) : null,
    currency: row.currency,
    status: row.status as InvoiceStatus,
    paid_date: row.paid_date,
    notes: row.notes,
    daysUntilDue: days,
    overdue: days !== null && days < 0,
  };
}

export async function listInvoices(role: Role, today = todayISO()): Promise<InvoiceView[]> {
  const [{ invoiceAmounts }, db] = await Promise.all([policyFor(role), getDb()]);
  const rows = await db.query<InvoiceRow>(
    `SELECT i.*, c.name AS client_name, c.vip AS vip
     FROM foundery.invoices i JOIN foundery.clients c ON c.id = i.client_id
     ORDER BY (i.status IN ('paid','void')) ASC, i.due_date ASC`,
  );
  return rows.map((row) => toInvoiceView(row, invoiceAmounts, today));
}

/**
 * The reminder feed: what needs chasing, and what still has to be raised.
 *
 * "Due soon" is a 10-day window because net-15 terms mean a nudge at day 5
 * is noise and a nudge at day 14 is too late.
 */
export type Reminder = {
  kind: "overdue" | "due_soon" | "to_raise";
  title: string;
  detail: string;
  clientName: string;
  vip: boolean;
  amount: number | null;
  currency: string;
  dueDate: string;
  days: number;
  invoiceId?: number;
  clientId: number;
};

const DUE_SOON_WINDOW_DAYS = 10;

export async function reminders(role: Role, today = todayISO()): Promise<Reminder[]> {
  const out: Reminder[] = [];

  for (const invoice of await listInvoices(role, today)) {
    if (invoice.status === "paid" || invoice.status === "void") continue;
    const days = invoice.daysUntilDue ?? 0;
    if (days < 0) {
      out.push({
        kind: "overdue",
        title: `${invoice.number} is ${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} overdue`,
        detail:
          invoice.status === "part_paid"
            ? "Part paid — chase the balance."
            : "Sent and unpaid. Chase it.",
        clientName: invoice.client_name,
        vip: invoice.vip,
        amount: invoice.outstanding,
        currency: invoice.currency,
        dueDate: invoice.due_date,
        days,
        invoiceId: invoice.id,
        clientId: invoice.client_id,
      });
    } else if (days <= DUE_SOON_WINDOW_DAYS) {
      out.push({
        kind: "due_soon",
        title: `${invoice.number} is due ${days === 0 ? "today" : `in ${days} ${days === 1 ? "day" : "days"}`}`,
        detail: invoice.status === "draft" ? "Still a draft — send it." : `Net ${invoice.terms_days} terms.`,
        clientName: invoice.client_name,
        vip: invoice.vip,
        amount: invoice.outstanding,
        currency: invoice.currency,
        dueDate: invoice.due_date,
        days,
        invoiceId: invoice.id,
        clientId: invoice.client_id,
      });
    }
  }

  out.push(...(await invoicesToRaise(role, today)));

  const rank = { overdue: 0, due_soon: 1, to_raise: 2 };
  return out.sort((a, b) => rank[a.kind] - rank[b.kind] || a.days - b.days);
}

/**
 * Retainers that should have been billed this month and haven't been.
 *
 * This is the "did we remember to invoice?" check — the failure mode that
 * costs an agency a month of cash and never shows up on an invoice list,
 * because the missing invoice isn't there to be listed.
 */
export async function invoicesToRaise(role: Role, today = todayISO()): Promise<Reminder[]> {
  const [{ invoiceAmounts }, db] = await Promise.all([policyFor(role), getDb()]);
  const month = monthKey(new Date(today));

  // One query rather than one per client: the clients with no invoice raised
  // in this month at all.
  const rows = await db.query<{
    id: number; name: string; vip: boolean; billing_day: number;
    terms_days: number; retainer_amount: number; currency: string;
  }>(
    `SELECT c.id, c.name, c.vip, c.billing_day, c.terms_days, c.retainer_amount, c.currency
     FROM foundery.clients c
     WHERE c.status = 'active' AND c.engagement = 'retainer'
       AND NOT EXISTS (
         SELECT 1 FROM foundery.invoices i
         WHERE i.client_id = c.id
           AND i.status <> 'void'
           AND to_char(i.issue_date, 'YYYY-MM') = $1
       )`,
    [month],
  );

  const out: Reminder[] = [];
  for (const client of rows) {
    const raiseOn = billingDateFor(month, client.billing_day);
    const daysToRaise = daysUntil(raiseOn, today);
    // Surface it from three days ahead of the billing date onward.
    if (daysToRaise > 3) continue;

    out.push({
      kind: "to_raise",
      title:
        daysToRaise < 0
          ? `${client.name}'s retainer invoice is ${Math.abs(daysToRaise)} ${Math.abs(daysToRaise) === 1 ? "day" : "days"} late going out`
          : `Raise ${client.name}'s retainer invoice`,
      detail: `Billing day ${client.billing_day}, net ${client.terms_days} — no invoice raised for this month yet.`,
      clientName: client.name,
      vip: client.vip,
      amount: invoiceAmounts ? client.retainer_amount : null,
      currency: client.currency,
      dueDate: addDays(raiseOn, client.terms_days),
      days: daysToRaise,
      clientId: client.id,
    });
  }
  return out;
}

export async function nextInvoiceNumber(): Promise<string> {
  const db = await getDb();
  const year = new Date().getFullYear();
  const rows = await db.query<{ number: string }>(
    `SELECT number FROM foundery.invoices WHERE number LIKE $1 ORDER BY number DESC LIMIT 1`,
    [`NRD-${year}-%`],
  );
  const last = rows[0] ? Number(rows[0].number.split("-").pop()) : 0;
  return `NRD-${year}-${String((Number.isFinite(last) ? last : 0) + 1).padStart(3, "0")}`;
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
  id: number; client_id: number; client_name: string; token: string; status: string;
  details: unknown; access: unknown; created_at: string; completed_at: string | null;
}): GuidedOnboarding {
  return {
    ...row,
    status: row.status as GuidedOnboarding["status"],
    details: toRecord<string>(row.details),
    access: toRecord<{ done: boolean; note?: string }>(row.access),
  };
}

export async function listGuidedOnboardings(): Promise<GuidedOnboarding[]> {
  const db = await getDb();
  try {
    const rows = await db.query<Parameters<typeof toGuided>[0]>(
      `SELECT o.id, o.client_id, c.name AS client_name, o.token, o.status,
              o.details, o.access, o.created_at, o.completed_at
       FROM foundery.onboardings o
       JOIN foundery.clients c ON c.id = o.client_id
       ORDER BY o.created_at DESC`,
    );
    return rows.map(toGuided);
  } catch {
    // The table ships in db/schema.sql; a database that hasn't had the
    // updated schema applied yet shouldn't take the clients page down with
    // it. Empty until `npm run db:setup` (or the SQL editor) catches up.
    console.warn("foundery.onboardings missing — re-run db/schema.sql to enable guided onboarding");
    return [];
  }
}

export async function getGuidedByToken(token: string): Promise<GuidedOnboarding | null> {
  const db = await getDb();
  try {
    const rows = await db.query<Parameters<typeof toGuided>[0]>(
      `SELECT o.id, o.client_id, c.name AS client_name, o.token, o.status,
              o.details, o.access, o.created_at, o.completed_at
       FROM foundery.onboardings o
       JOIN foundery.clients c ON c.id = o.client_id
       WHERE o.token = $1`,
      [token],
    );
    return rows[0] ? toGuided(rows[0]) : null;
  } catch {
    return null;
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
