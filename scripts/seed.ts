/**
 * Fills an empty database with a plausible agency so every screen has
 * something to show on first run. Safe to re-run: it only writes when the
 * clients table is empty, unless you pass --force.
 *
 *   npm run seed          seed if empty
 *   npm run seed -- --force   wipe and re-seed
 *   npm run reset         delete the file and seed from scratch
 */
import crypto from "node:crypto";
import { getDb, setSetting } from "../src/lib/db";
import { addDays, billingDateFor, monthKey, todayISO } from "../src/lib/dates";
import { DEFAULT_ONBOARDING_FIELDS } from "../src/lib/taxonomy";

const force = process.argv.includes("--force");
const db = getDb();

const existing = db.prepare(`SELECT COUNT(*) AS n FROM clients`).get() as { n: number };
if (existing.n > 0 && !force) {
  console.log(`Database already has ${existing.n} clients — nothing to do. Use --force to replace them.`);
  process.exit(0);
}

if (force) {
  for (const table of [
    "onboarding_submissions", "onboarding_forms", "invoices", "costs",
    "clients", "pnl_months", "audit_log",
  ]) {
    db.prepare(`DELETE FROM ${table}`).run();
  }
}

const today = todayISO();
const thisMonth = monthKey();
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* ------------------------------------------------------------------ clients */

const clients = [
  {
    name: "Kidology", engagement: "retainer", vip: 1, status: "active",
    services: ["Performance marketing", "Performance creatives", "UGC"],
    retainer: 185000, delivery: 82000, health: "green", owner: "Laksh",
    start: monthsAgo(9) + "-01", billing: 1, terms: 15,
    notes: "Kids' apparel D2C. Scaling Meta, TikTok next quarter.",
  },
  {
    name: "UniSeoul", engagement: "retainer", vip: 1, status: "active",
    services: ["Performance marketing", "AI ads", "Social media"],
    retainer: 225000, delivery: 96000, health: "green", owner: "Laksh",
    start: monthsAgo(6) + "-15", billing: 5, terms: 15,
    notes: "K-beauty importer. Biggest account, biggest concentration risk.",
  },
  {
    name: "Wellness Shop", engagement: "retainer", vip: 0, status: "active",
    services: ["Performance marketing", "Email & retention"],
    retainer: 120000, delivery: 71000, health: "amber", owner: "Priya",
    start: monthsAgo(4) + "-01", billing: 1, terms: 30,
    notes: "Margin is thin and they pay late. Repricing conversation booked.",
  },
  {
    name: "Halcyon Coffee", engagement: "retainer", vip: 0, status: "active",
    services: ["Social media", "Performance creatives"],
    retainer: 85000, delivery: 38000, health: "green", owner: "Priya",
    start: monthsAgo(2) + "-10", billing: 10, terms: 15,
    notes: "Small but clean. Wants UGC added in Q3.",
  },
  {
    name: "Nordwell Home", engagement: "one_time", vip: 0, status: "active",
    services: ["Web & landing pages", "Performance creatives"],
    oneTime: 340000, delivery: 62000, health: "green", owner: "Laksh",
    start: monthsAgo(1) + "-01", end: addDays(today, 45), billing: 1, terms: 15,
    notes: "Site rebuild plus a creative bank. Billed in three phases.",
  },
  {
    name: "Bluewater Fit", engagement: "retainer", vip: 0, status: "paused",
    services: ["Performance marketing"],
    retainer: 95000, delivery: 44000, health: "red", owner: "Priya",
    start: monthsAgo(11) + "-01", billing: 1, terms: 15,
    notes: "Paused for one month while they sort inventory. Might not come back.",
  },
  {
    name: "Stitchcraft", engagement: "retainer", vip: 0, status: "churned",
    services: ["Performance marketing", "UGC"],
    retainer: 0, delivery: 0, health: "red", owner: "Laksh",
    start: monthsAgo(14) + "-01", end: monthsAgo(3) + "-28", billing: 1, terms: 15,
    notes: "Took it in-house. Left on good terms.",
  },
];

const insertClient = db.prepare(
  `INSERT INTO clients (name, slug, status, engagement, vip, services, retainer_amount,
     one_time_value, delivery_cost, start_date, end_date, billing_day, terms_days, owner, health, notes)
   VALUES (@name, @slug, @status, @engagement, @vip, @services, @retainer, @oneTime,
     @delivery, @start, @end, @billing, @terms, @owner, @health, @notes)`,
);

const clientIds = new Map<string, number>();
for (const client of clients) {
  const result = insertClient.run({
    ...client,
    slug: client.name.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    services: JSON.stringify(client.services),
    retainer: client.retainer ?? 0,
    oneTime: client.oneTime ?? 0,
    end: client.end ?? null,
  });
  clientIds.set(client.name, Number(result.lastInsertRowid));
}

/* -------------------------------------------------------------------- costs */

const costs = [
  { category: "salary", label: "Media buyer", person: "Priya Nair", amount: 95000, cadence: "monthly" },
  { category: "salary", label: "Creative strategist", person: "Aditya Rao", amount: 78000, cadence: "monthly" },
  { category: "salary", label: "Performance designer", person: "Meera Shah", amount: 62000, cadence: "monthly" },
  { category: "salary", label: "Account executive", person: "Rohan Gupta", amount: 45000, cadence: "monthly" },

  { category: "tools", label: "Meta Business tooling", amount: 4200, cadence: "monthly" },
  { category: "tools", label: "Figma", amount: 3600, cadence: "monthly" },
  { category: "tools", label: "Notion", amount: 2400, cadence: "monthly" },
  { category: "tools", label: "Slack", amount: 5800, cadence: "monthly" },
  { category: "tools", label: "Adobe Creative Cloud", amount: 84000, cadence: "annual" },
  { category: "tools", label: "Google Workspace", amount: 36000, cadence: "annual" },

  { category: "contractor", label: "UGC creators pool", amount: 65000, cadence: "monthly" },
  { category: "contractor", label: "Video editor", person: "Freelance — Sameer", amount: 40000, cadence: "monthly" },
  { category: "contractor", label: "Webflow developer", person: "Freelance — Ankit", amount: 35000, cadence: "monthly" },

  { category: "marketing", label: "Founder content production", amount: 25000, cadence: "monthly" },
  { category: "marketing", label: "Newsletter sponsorships", amount: 18000, cadence: "monthly" },

  { category: "charity", label: "Local school digital literacy programme", amount: 15000, cadence: "monthly" },

  { category: "other", label: "Coworking desks", amount: 32000, cadence: "monthly" },
  { category: "other", label: "CA and compliance", amount: 12000, cadence: "monthly" },
];

const insertCost = db.prepare(
  `INSERT INTO costs (category, label, person, amount, cadence, start_date, active)
   VALUES (@category, @label, @person, @amount, @cadence, @start, 1)`,
);
// Costs start where the invoice history starts, so the P&L compares like with
// like. Months before that show a dash rather than a full cost base against no
// revenue, which would read as five catastrophic months that never happened.
for (const cost of costs) {
  insertCost.run({
    ...cost,
    person: cost.person ?? null,
    start: monthsAgo(6) + "-01",
  });
}

/* ----------------------------------------------------------------- invoices */

const insertInvoice = db.prepare(
  `INSERT INTO invoices (client_id, number, period, issue_date, due_date, terms_days,
     amount, amount_paid, status, paid_date, notes)
   VALUES (@client_id, @number, @period, @issue_date, @due_date, @terms_days,
     @amount, @amount_paid, @status, @paid_date, @notes)`,
);

let counter = 1;
const year = new Date().getFullYear();
function invoiceNumber(): string {
  return `NRD-${year}-${String(counter++).padStart(3, "0")}`;
}

// Six months of settled history for the retainer clients, so the P&L has a shape.
for (let back = 6; back >= 1; back--) {
  const month = monthsAgo(back);
  for (const name of ["Kidology", "UniSeoul", "Wellness Shop"]) {
    const client = clients.find((c) => c.name === name)!;
    if (client.start > `${month}-28`) continue;
    const issue = billingDateFor(month, client.billing);
    const due = addDays(issue, client.terms);
    insertInvoice.run({
      client_id: clientIds.get(name)!,
      number: invoiceNumber(),
      period: month,
      issue_date: issue,
      due_date: due,
      terms_days: client.terms,
      amount: client.retainer,
      amount_paid: client.retainer,
      status: "paid",
      paid_date: addDays(due, name === "Wellness Shop" ? 6 : -2),
      notes: null,
    });
  }
}

// The live picture: one overdue, one sitting inside terms, one still a draft,
// and Halcyon deliberately left unbilled so the "you haven't raised it" nudge fires.
const live = [
  {
    name: "Wellness Shop", status: "sent", issue: addDays(today, -38),
    terms: 30, paid: 0, note: "Chased once by email. No reply.",
  },
  {
    name: "Kidology", status: "part_paid", issue: addDays(today, -20),
    terms: 15, paidFraction: 0.5, note: "Paid half while their finance team sorts the PO.",
  },
  {
    name: "UniSeoul", status: "sent", issue: addDays(today, -4),
    terms: 15, paid: 0, note: null,
  },
];

for (const item of live) {
  const client = clients.find((c) => c.name === item.name)!;
  const amount = client.retainer!;
  insertInvoice.run({
    client_id: clientIds.get(item.name)!,
    number: invoiceNumber(),
    period: thisMonth,
    issue_date: item.issue,
    due_date: addDays(item.issue, item.terms),
    terms_days: item.terms,
    amount,
    amount_paid: item.paidFraction ? amount * item.paidFraction : 0,
    status: item.status,
    paid_date: null,
    notes: item.note,
  });
}

// Nordwell's project, billed in phases.
insertInvoice.run({
  client_id: clientIds.get("Nordwell Home")!,
  number: invoiceNumber(),
  period: "Phase 1 — discovery & design",
  issue_date: addDays(today, -30),
  due_date: addDays(today, -15),
  terms_days: 15,
  amount: 136000,
  amount_paid: 136000,
  status: "paid",
  paid_date: addDays(today, -14),
  notes: "40% up front.",
});
insertInvoice.run({
  client_id: clientIds.get("Nordwell Home")!,
  number: invoiceNumber(),
  period: "Phase 2 — build",
  issue_date: today,
  due_date: addDays(today, 15),
  terms_days: 15,
  amount: 136000,
  amount_paid: 0,
  status: "draft",
  paid_date: null,
  notes: "Send once the staging site is signed off.",
});

/* --------------------------------------------------------------- onboarding */

const formResult = db
  .prepare(
    `INSERT INTO onboarding_forms (title, intro, token, client_id, fields, status, created_by)
     VALUES (@title, @intro, @token, NULL, @fields, 'open', 'founder')`,
  )
  .run({
    title: "Neuroid client onboarding",
    intro:
      "Fifteen minutes here saves us a fortnight of back-and-forth later. Answer what you can — " +
      "anything you don't have yet, leave blank and we'll pick it up on the kickoff call.",
    token: crypto.randomBytes(18).toString("base64url"),
    fields: JSON.stringify(DEFAULT_ONBOARDING_FIELDS.map((f) => ({ ...f, hint: f.hint || undefined }))),
  });

db.prepare(`INSERT INTO onboarding_submissions (form_id, answers, submitted_at) VALUES (?, ?, ?)`).run(
  Number(formResult.lastInsertRowid),
  JSON.stringify({
    brand: "Halcyon Coffee",
    contact_name: "Ishita Menon",
    contact_email: "ishita@halcyoncoffee.in",
    whatsapp: "+91 98200 11223",
    website: "https://halcyoncoffee.in",
    category: "Speciality coffee beans and brewing kit",
    monthly_spend: "About ₹4L across Meta and Google",
    goal: "Get subscriptions past 1,000 active without the CAC running away.",
    audience: "25–40, urban, already drink filter coffee, buying their first grinder.",
    assets: "https://drive.google.com/drive/folders/example",
    access: "Ishita holds the Meta and Shopify logins.",
  }),
  `${addDays(today, -12)} 10:24:00`,
);

/* ------------------------------------------------------------------- P&L rows */

const insertMonth = db.prepare(
  `INSERT INTO pnl_months (month, other_income, one_off_costs, tax_rate, notes, closed)
   VALUES (?, ?, ?, ?, ?, ?)`,
);
insertMonth.run(monthsAgo(3), 0, 45000, 0.25, "New camera kit for the content studio.", 1);
insertMonth.run(monthsAgo(2), 60000, 0, 0.25, "One-off consulting day for a friend's brand.", 1);
insertMonth.run(monthsAgo(1), 0, 0, 0.25, null, 1);

setSetting("business_name", "Neuroid Media");
setSetting("cash_buffer", "1800000");

console.log(
  `Seeded ${clients.length} clients, ${costs.length} cost lines, ` +
    `${counter - 1} invoices and 1 onboarding form.`,
);
