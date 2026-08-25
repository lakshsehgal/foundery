import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setupTempDb } from "./helpers.mjs";

setupTempDb("finance");

const { getDb } = await import("../src/lib/db");
const { costsForMonth, monthlyBurn } = await import("../src/lib/queries");
const { pnl, pnlTotals, riskReport, projection, clientEconomics } = await import("../src/lib/analytics");
const { fmtPct, fmtCompact, monthlyEquivalent } = await import("../src/lib/money");
const { spreadProject, marginPct, revenueSplit, monthlyRevenue } = await import(
  "../src/lib/economics"
);
const { billingDateFor, daysUntil, lastMonths } = await import("../src/lib/dates");

const db = await getDb();

const [big] = await db.query<{ id: number }>(
  `INSERT INTO foundery.clients (name, slug, status, engagement, vip, services, retainer_amount,
     delivery_cost, start_date, billing_day, terms_days, health)
   VALUES ('Big','big','active','retainer',false,'[]',400000,150000,'2026-01-01',1,15,'green')
   RETURNING id`,
);
const [small] = await db.query<{ id: number }>(
  `INSERT INTO foundery.clients (name, slug, status, engagement, vip, services, retainer_amount,
     delivery_cost, start_date, billing_day, terms_days, health)
   VALUES ('Small','small','active','retainer',false,'[]',100000,90000,'2026-01-01',1,15,'red')
   RETURNING id`,
);

// A cost that ran for three months and then stopped.
await db.query(
  `INSERT INTO foundery.costs (category, label, amount, cadence, start_date, end_date, active)
   VALUES ('contractor','Editor',50000,'monthly','2026-03-01','2026-05-31',false)`,
);
// A cost still running.
await db.query(
  `INSERT INTO foundery.costs (category, label, amount, cadence, start_date, active)
   VALUES ('salary','Buyer',200000,'monthly','2026-01-01',true)`,
);

describe("money", () => {
  test("annual costs land at a twelfth, one-offs stay out of the run rate", () => {
    assert.equal(monthlyEquivalent(120000, "annual"), 10000);
    assert.equal(monthlyEquivalent(5000, "monthly"), 5000);
    assert.equal(monthlyEquivalent(50000, "one_time"), 0);
  });

  test("compact rupees use lakh and crore, not millions", () => {
    assert.equal(fmtCompact(548000, "INR"), "₹5.5L");
    assert.equal(fmtCompact(12_500_000, "INR"), "₹1.3Cr");
    assert.equal(fmtCompact(1_200_000, "USD"), "$1.2M");
  });

  test("a percentage that rounds to zero never prints as minus zero", () => {
    assert.equal(fmtPct(-0.36, 0), "0%");
    assert.equal(fmtPct(-4.2, 0), "-4%");
    assert.equal(fmtPct(Number.NaN), "—");
  });
});

describe("contracts", () => {
  test("a dated project spreads evenly across the months it runs, inclusive", () => {
    assert.equal(spreadProject(300000, "2026-07-01", "2026-09-30"), 100000);
    assert.equal(spreadProject(300000, "2026-07-01", "2026-07-31"), 300000);
  });

  test("an undated project falls back to a three-month spread, not a spike", () => {
    assert.equal(spreadProject(300000, null, null), 100000);
  });

  test("margin is null rather than zero when there is no revenue to divide by", () => {
    assert.equal(marginPct(0, 5000), null);
    assert.equal(marginPct(100000, 40000), 60);
  });

  test("a retainer is all recurring, a project is all one-off, and the halves sum to the total", () => {
    const retainer = {
      engagement: "retainer",
      retainer_amount: 80000,
      one_time_value: 0,
      start_date: null,
      end_date: null,
    };
    const project = {
      engagement: "one_time",
      retainer_amount: 0,
      one_time_value: 300000,
      start_date: "2026-07-01",
      end_date: "2026-09-30",
    };
    assert.deepEqual(revenueSplit(retainer), { recurring: 80000, project: 0 });
    assert.deepEqual(revenueSplit(project), { recurring: 0, project: 100000 });
    assert.equal(monthlyRevenue(retainer), 80000);
    assert.equal(monthlyRevenue(project), 100000);
  });

  test("a retainer's stray one-time value never leaks into recurring revenue", () => {
    // A client switched from project to retainer keeps the old total on the
    // row (the form carries it so nothing is wiped) — it must not be counted.
    const switched = {
      engagement: "retainer",
      retainer_amount: 60000,
      one_time_value: 250000,
      start_date: null,
      end_date: null,
    };
    assert.deepEqual(revenueSplit(switched), { recurring: 60000, project: 0 });
  });
});

describe("dates", () => {
  test("a billing day past the end of a short month clamps to its last day", () => {
    assert.equal(billingDateFor("2026-02", 31), "2026-02-28");
    assert.equal(billingDateFor("2026-04", 31), "2026-04-30");
    assert.equal(billingDateFor("2026-08", 5), "2026-08-05");
  });

  test("days-until is negative once the date has passed", () => {
    assert.equal(daysUntil("2026-08-30", "2026-08-24"), 6);
    assert.equal(daysUntil("2026-08-20", "2026-08-24"), -4);
  });

  test("lastMonths walks backwards across a year boundary", () => {
    assert.deepEqual(lastMonths(3, "2026-01"), ["2025-11", "2025-12", "2026-01"]);
  });
});

describe("cost history", () => {
  test("a month only carries the costs that were live in it", async () => {
    // February: the editor hadn't started.
    assert.equal(await costsForMonth("2026-02"), 200000);
    // April: both running.
    assert.equal(await costsForMonth("2026-04"), 250000);
    // June: the editor had stopped.
    assert.equal(await costsForMonth("2026-06"), 200000);
  });

  test("the run rate counts only what is still active", async () => {
    assert.equal(await monthlyBurn(), 200000);
  });
});

describe("P&L", () => {
  test("a month with no invoices and no costs is unknown, not zero", async () => {
    const rows = await pnl(12, "invoiced");
    const early = rows.find((row) => row.month === "2025-09");
    assert.ok(early);
    assert.equal(early.hasData, false, "shown as a dash, so it can't read as a month we earned nothing");
  });

  test("tax only applies to a month that made a profit", async () => {
    await db.query(
      `INSERT INTO foundery.invoices (client_id, number, issue_date, due_date, terms_days, amount, amount_paid, status, paid_date)
       VALUES ($1,'A','2026-07-01','2026-07-16',15,500000,500000,'paid','2026-07-10')`,
      [big.id],
    );
    await db.query(
      `INSERT INTO foundery.pnl_months (month, other_income, one_off_costs, tax_rate, closed)
       VALUES ('2026-07', 0, 0, 0.25, true)`,
    );

    const july = (await pnl(12, "invoiced")).find((row) => row.month === "2026-07")!;
    assert.equal(july.invoiced, 500000);
    assert.equal(july.costs, 200000);
    assert.equal(july.profitBeforeTax, 300000);
    assert.equal(july.tax, 75000);
    assert.equal(july.profit, 225000);
    assert.equal(july.taxRatePct, 25);

    // A loss-making month is not taxed.
    await db.query(
      `INSERT INTO foundery.pnl_months (month, other_income, one_off_costs, tax_rate, closed)
       VALUES ('2026-06', 0, 0, 0.25, true)`,
    );
    const june = (await pnl(12, "invoiced")).find((row) => row.month === "2026-06")!;
    assert.ok(june.profitBeforeTax < 0);
    assert.equal(june.tax, 0);
  });

  test("invoiced and collected are different questions", async () => {
    await db.query(
      `INSERT INTO foundery.invoices (client_id, number, issue_date, due_date, terms_days, amount, amount_paid, status, paid_date)
       VALUES ($1,'B','2026-05-01','2026-05-16',15,300000,300000,'paid','2026-06-20')`,
      [small.id],
    );
    const invoiced = (await pnl(12, "invoiced")).find((row) => row.month === "2026-05")!;
    const collected = (await pnl(12, "collected")).find((row) => row.month === "2026-05")!;
    assert.equal(invoiced.invoiced, 300000);
    assert.equal(collected.collected, 0, "the money landed in June, not May");
  });

  test("totals ignore months that never happened", async () => {
    const rows = await pnl(12, "invoiced");
    const totals = pnlTotals(rows);
    assert.equal(totals.months, rows.filter((row) => row.hasData).length);
    assert.ok(totals.months < 12);
  });
});

describe("risk", () => {
  test("one client owning most of the revenue is called out as critical", async () => {
    const report = await riskReport("2026-08-24");
    const concentration = report.findings.find((finding) => finding.key === "concentration")!;
    assert.equal(concentration.severity, "critical", "Big is 80% of revenue");
    assert.ok(concentration.title.includes("Big"));
    assert.ok(concentration.title.includes("80%"));
  });

  test("a flagged account is reported with the share of revenue it carries", async () => {
    const health = (await riskReport("2026-08-24")).findings.find((finding) => finding.key === "health")!;
    assert.ok(health.detail.includes("Small"));
    assert.equal(health.metric, "20%");
  });

  test("the score is capped and banded", async () => {
    const report = await riskReport("2026-08-24");
    assert.ok(report.score >= 0 && report.score <= 100);
    assert.ok(["steady", "watch", "exposed"].includes(report.band));
  });

  test("every finding that isn't good carries something to do about it", async () => {
    for (const finding of (await riskReport("2026-08-24")).findings) {
      if (finding.severity === "good") continue;
      assert.notEqual(finding.action, "Nothing to do.", `${finding.key} needs an action`);
      assert.ok(finding.action.length > 10);
    }
  });
});

describe("projection", () => {
  test("revenue stops at a client's end date rather than running forever", async () => {
    await db.query(`UPDATE foundery.clients SET end_date = '2026-10-31' WHERE name = 'Big'`);
    const months = await projection(6);
    const withBig = months.filter((month) => month.revenue >= 500000).length;
    const withoutBig = months.filter((month) => month.revenue === 100000).length;
    assert.ok(withBig > 0 && withoutBig > 0, "the cliff shows up inside the window");
    await db.query(`UPDATE foundery.clients SET end_date = NULL WHERE name = 'Big'`);
  });

  test("confidence decays the further out the month is", async () => {
    const months = await projection(6);
    assert.equal(months[0].confidence, "booked");
    assert.equal(months[5].confidence, "assumed");
  });
});

describe("client economics", () => {
  test("shares of revenue add up to a hundred", async () => {
    const total = (await clientEconomics()).reduce((sum, client) => sum + client.shareOfRevenuePct, 0);
    assert.ok(Math.abs(total - 100) < 0.001);
  });
});

describe("database TLS", () => {
  test("ssl params in the connection string are stripped and decided by us", async () => {
    const { resolveSsl } = await import("../src/lib/db");

    // Supabase's injected URL shape: sslmode=require plus extras.
    const supabase = resolveSsl(
      "postgres://postgres.ref:pw@aws-0-ap-south-1.pooler.supabase.com:6543/postgres?sslmode=require&supa=base-pooler.x",
    );
    assert.ok(!supabase.cleanUrl.includes("sslmode"), "sslmode must not reach the driver");
    assert.ok(supabase.cleanUrl.includes("supa=base-pooler.x"), "unrelated params survive");
    assert.deepEqual(supabase.ssl, { rejectUnauthorized: false });

    // A CA cert upgrades to full verification.
    process.env.FOUNDERY_DB_CA_CERT = "-----BEGIN CERTIFICATE-----fake";
    const verified = resolveSsl("postgres://u:p@host:6543/db?sslmode=require");
    assert.deepEqual(verified.ssl, {
      ca: "-----BEGIN CERTIFICATE-----fake",
      rejectUnauthorized: true,
    });
    delete process.env.FOUNDERY_DB_CA_CERT;

    // An explicit disable is honoured.
    assert.equal(resolveSsl("postgres://u:p@localhost:5432/db?sslmode=disable").ssl, false);

    // No params at all: unchanged URL, encrypted-not-verified.
    const bare = resolveSsl("postgres://u:p@host:6543/db");
    assert.equal(bare.cleanUrl, "postgres://u:p@host:6543/db");
    assert.deepEqual(bare.ssl, { rejectUnauthorized: false });
  });
});
