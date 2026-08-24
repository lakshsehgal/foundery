import "server-only";
import { getDb } from "./db";
import type { Role } from "./auth";
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
};

type ClientRow = {
  id: number; name: string; slug: string; status: string; engagement: string;
  vip: number; services: string; owner: string | null; start_date: string | null;
  end_date: string | null; billing_day: number; terms_days: number; currency: string;
  notes: string | null; retainer_amount: number; one_time_value: number;
  delivery_cost: number; health: string;
};

function parseServices(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((s) => typeof s === "string") : [];
  } catch {
    return [];
  }
}

function toClientView(row: ClientRow, showValues: boolean): ClientView {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as ClientStatus,
    engagement: row.engagement as Engagement,
    vip: row.vip === 1,
    services: parseServices(row.services),
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
  };
}

export function listClients(role: Role): ClientView[] {
  const show = policyFor(role).clientValues;
  const rows = getDb()
    .prepare(
      `SELECT * FROM clients
       ORDER BY (status = 'active') DESC, vip DESC, name COLLATE NOCASE`,
    )
    .all() as ClientRow[];
  return rows.map((row) => toClientView(row, show));
}

export function getClient(role: Role, id: number): ClientView | null {
  const row = getDb().prepare(`SELECT * FROM clients WHERE id = ?`).get(id) as ClientRow | undefined;
  if (!row) return null;
  return toClientView(row, policyFor(role).clientValues);
}

/** Names and ids only — safe for any role, used to populate pickers. */
export function clientOptions(): { id: number; name: string; terms_days: number; billing_day: number }[] {
  return getDb()
    .prepare(
      `SELECT id, name, terms_days, billing_day FROM clients
       WHERE status != 'churned' ORDER BY name COLLATE NOCASE`,
    )
    .all() as { id: number; name: string; terms_days: number; billing_day: number }[];
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
  active: number; client_id: number | null; notes: string | null;
};

/**
 * Cost lines for the signed-in role.
 *
 * For a category the role can't itemise (salaries, for an operator) the rows
 * are collapsed into one aggregate line carrying the category total and a
 * headcount. Individual amounts and names are dropped before the data leaves
 * this function, so they never reach the browser at all.
 */
export function listCosts(role: Role, opts: { includeInactive?: boolean } = {}): CostView[] {
  const policy = policyFor(role);
  const rows = getDb()
    .prepare(
      `SELECT * FROM costs
       ${opts.includeInactive ? "" : "WHERE active = 1"}
       ORDER BY category, amount DESC`,
    )
    .all() as CostRow[];

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
        active: row.active === 1,
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

  const order = COST_CATEGORIES.map((c) => c.key);
  return out.sort(
    (a, b) => order.indexOf(a.category) - order.indexOf(b.category) || (b.monthly ?? 0) - (a.monthly ?? 0),
  );
}

/** Monthly run-rate per category. Visible in full to both roles. */
export function costTotals(): { category: CostCategory; total: number; count: number }[] {
  const rows = getDb()
    .prepare(`SELECT category, amount, cadence FROM costs WHERE active = 1`)
    .all() as { category: string; amount: number; cadence: string }[];

  const map = new Map<CostCategory, { total: number; count: number }>();
  for (const c of COST_CATEGORIES) map.set(c.key, { total: 0, count: 0 });
  for (const row of rows) {
    const key = row.category as CostCategory;
    const bucket = map.get(key) ?? { total: 0, count: 0 };
    bucket.total += monthlyEquivalent(row.amount, row.cadence);
    bucket.count += 1;
    map.set(key, bucket);
  }
  return COST_CATEGORIES.map((c) => ({ category: c.key, ...map.get(c.key)! }));
}

export function monthlyBurn(): number {
  return costTotals().reduce((sum, row) => sum + row.total, 0);
}

/**
 * What the cost base actually was in a given month — used by the P&L, where
 * today's run-rate would be the wrong number for a month six months ago.
 */
export function costsForMonth(month: string): number {
  const start = `${month}-01`;
  const end = billingDateFor(month, 31);
  const rows = getDb()
    .prepare(
      `SELECT amount, cadence FROM costs
       WHERE (start_date IS NULL OR start_date <= ?)
         AND (end_date   IS NULL OR end_date   >= ?)`,
    )
    .all(end, start) as { amount: number; cadence: string }[];
  const recurring = rows.reduce((sum, r) => sum + monthlyEquivalent(r.amount, r.cadence), 0);

  const oneOffs = getDb()
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM costs
       WHERE cadence = 'one_time' AND start_date >= ? AND start_date <= ?`,
    )
    .get(start, end) as { total: number };

  return recurring + oneOffs.total;
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
  id: number; client_id: number; client_name: string; vip: number; number: string;
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
    vip: row.vip === 1,
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

export function listInvoices(role: Role, today = todayISO()): InvoiceView[] {
  const show = policyFor(role).invoiceAmounts;
  const rows = getDb()
    .prepare(
      `SELECT i.*, c.name AS client_name, c.vip AS vip
       FROM invoices i JOIN clients c ON c.id = i.client_id
       ORDER BY (i.status IN ('paid','void')) ASC, i.due_date ASC`,
    )
    .all() as InvoiceRow[];
  return rows.map((row) => toInvoiceView(row, show, today));
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

export function reminders(role: Role, today = todayISO()): Reminder[] {
  const out: Reminder[] = [];

  for (const invoice of listInvoices(role, today)) {
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

  out.push(...invoicesToRaise(role, today));

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
export function invoicesToRaise(role: Role, today = todayISO()): Reminder[] {
  const show = policyFor(role).invoiceAmounts;
  const month = monthKey(new Date(today));
  const rows = getDb()
    .prepare(
      `SELECT id, name, vip, billing_day, terms_days, retainer_amount, currency
       FROM clients
       WHERE status = 'active' AND engagement = 'retainer'`,
    )
    .all() as {
      id: number; name: string; vip: number; billing_day: number;
      terms_days: number; retainer_amount: number; currency: string;
    }[];

  const out: Reminder[] = [];
  for (const client of rows) {
    const already = getDb()
      .prepare(
        `SELECT COUNT(*) AS n FROM invoices
         WHERE client_id = ? AND status != 'void' AND substr(issue_date, 1, 7) = ?`,
      )
      .get(client.id, month) as { n: number };
    if (already.n > 0) continue;

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
      vip: client.vip === 1,
      amount: show ? client.retainer_amount : null,
      currency: client.currency,
      dueDate: addDays(raiseOn, client.terms_days),
      days: daysToRaise,
      clientId: client.id,
    });
  }
  return out;
}

export function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const row = getDb()
    .prepare(`SELECT number FROM invoices WHERE number LIKE ? ORDER BY number DESC LIMIT 1`)
    .get(`NRD-${year}-%`) as { number: string } | undefined;
  const last = row ? Number(row.number.split("-").pop()) : 0;
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

export function listForms(): FormView[] {
  const rows = getDb()
    .prepare(
      `SELECT f.*, c.name AS client_name,
              (SELECT COUNT(*) FROM onboarding_submissions s WHERE s.form_id = f.id) AS submissions,
              (SELECT MAX(submitted_at) FROM onboarding_submissions s WHERE s.form_id = f.id) AS last_submission
       FROM onboarding_forms f
       LEFT JOIN clients c ON c.id = f.client_id
       ORDER BY f.created_at DESC`,
    )
    .all() as (Omit<FormView, "fields" | "submissions" | "lastSubmission"> & {
      fields: string; submissions: number; last_submission: string | null;
    })[];

  return rows.map((row) => ({
    ...row,
    fields: safeFields(row.fields),
    submissions: row.submissions,
    lastSubmission: row.last_submission,
  }));
}

export function getFormByToken(token: string): FormView | null {
  const row = getDb()
    .prepare(
      `SELECT f.*, c.name AS client_name, 0 AS submissions, NULL AS last_submission
       FROM onboarding_forms f LEFT JOIN clients c ON c.id = f.client_id
       WHERE f.token = ?`,
    )
    .get(token) as (FormView & { fields: string }) | undefined;
  if (!row) return null;
  return { ...row, fields: safeFields(row.fields), submissions: 0, lastSubmission: null };
}

function safeFields(raw: string): OnboardingField[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
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

export function listSubmissions(formId?: number): SubmissionView[] {
  const rows = getDb()
    .prepare(
      `SELECT s.id, s.form_id, s.answers, s.submitted_at,
              f.title AS form_title, f.fields AS fields, c.name AS client_name
       FROM onboarding_submissions s
       JOIN onboarding_forms f ON f.id = s.form_id
       LEFT JOIN clients c ON c.id = f.client_id
       ${formId ? "WHERE s.form_id = ?" : ""}
       ORDER BY s.submitted_at DESC`,
    )
    .all(...(formId ? [formId] : [])) as {
      id: number; form_id: number; answers: string; submitted_at: string;
      form_title: string; fields: string; client_name: string | null;
    }[];

  return rows.map((row) => {
    let answers: Record<string, string> = {};
    try {
      const parsed = JSON.parse(row.answers);
      if (parsed && typeof parsed === "object") answers = parsed;
    } catch {
      answers = {};
    }
    return {
      id: row.id,
      form_id: row.form_id,
      form_title: row.form_title,
      client_name: row.client_name,
      answers,
      fields: safeFields(row.fields),
      submitted_at: row.submitted_at,
    };
  });
}

export function publicFormUrl(token: string): string {
  const base = (process.env.FOUNDERY_PUBLIC_URL || "http://localhost:3000").replace(/\/$/, "");
  return `${base}/onboard/${token}`;
}
