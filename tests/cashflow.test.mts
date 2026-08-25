import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setupTempDb, TODAY } from "./helpers.mjs";

setupTempDb("cashflow");

const { getDb } = await import("../src/lib/db");
const { cashCalendar, billingHonesty, collectionSpeed } = await import("../src/lib/cashflow");

const db = await getDb();

// One retainer billing on the 1st, net 15, live since January.
const [steady] = await db.query<{ id: number }>(
  `INSERT INTO foundery.clients (name, slug, status, engagement, services, retainer_amount,
     start_date, billing_day, terms_days)
   VALUES ('Steady','steady','active','retainer','[]',100000,'2026-01-01',1,15)
   RETURNING id`,
);
// One project kicking off mid-September — cash lands inside the window.
await db.query(
  `INSERT INTO foundery.clients (name, slug, status, engagement, services, one_time_value,
     start_date, end_date, billing_day, terms_days)
   VALUES ('Launch Co','launch','active','one_time','[]',250000,'2026-09-15','2026-10-31',1,15)`,
);

describe("cash calendar", () => {
  test("every expected payment gets a landing date from billing day + terms", async () => {
    // TODAY is 2026-08-24: July and August retainers are unraised and past
    // their billing day (assumed to go out now → today + 15), September and
    // October are upcoming, November lands beyond the 70-day horizon.
    const calendar = await cashCalendar(TODAY);
    assert.deepEqual(
      calendar.inflows.map((item) => [item.clientName, item.monthLabel, item.expectedOn, item.status]),
      [
        ["Steady", "Jul 2026", "2026-09-08", "overdue"],
        ["Steady", "Aug 2026", "2026-09-08", "overdue"],
        ["Steady", "Sept 2026", "2026-09-16", "upcoming"],
        ["Launch Co", "Sept 2026", "2026-09-30", "upcoming"],
        ["Steady", "Oct 2026", "2026-10-16", "upcoming"],
      ],
    );
  });

  test("a raised invoice's clock runs from its actual raise date", async () => {
    await db.query(
      `INSERT INTO foundery.raised_invoices (client_id, month, raised_at)
       VALUES ($1, '2026-08', '2026-08-05')`,
      [steady.id],
    );
    const august = (await cashCalendar(TODAY)).inflows.find((i) => i.monthLabel === "Aug 2026")!;
    assert.equal(august.expectedOn, "2026-08-20", "raised 5 Aug on net 15");
    assert.equal(august.status, "overdue", "20 Aug has passed");
    // Late money is expected in the first week, not written off in the past.
    const calendar = await cashCalendar(TODAY);
    assert.ok(calendar.weeks[0].inflow >= 100000);
  });

  test("a paid invoice leaves the calendar, and the balance line projects from the bank", async () => {
    await db.query(`UPDATE foundery.raised_invoices SET paid_at = now() WHERE month = '2026-08'`);
    const { setSetting } = await import("../src/lib/db");
    await setSetting("cash_buffer", "500000");
    const calendar = await cashCalendar(TODAY);
    assert.equal(calendar.inflows.some((i) => i.monthLabel === "Aug 2026"), false);
    assert.equal(calendar.openingBalance, 500000);
    assert.ok(calendar.weeks.every((week) => week.balance !== null));
    assert.ok(calendar.low !== null);
  });
});

describe("contracted vs raised vs collected", () => {
  test("the two gaps are named and never negative", async () => {
    const months = await billingHonesty(TODAY);
    const august = months.find((m) => m.month === "2026-08")!;
    assert.equal(august.contracted, 100000);
    assert.equal(august.raised, 100000, "the August mark counts as raised");
    assert.equal(august.collected, 100000, "and it was marked paid");
    assert.equal(august.leakage, 0);
    assert.equal(august.lag, 0);

    const july = months.find((m) => m.month === "2026-07")!;
    assert.equal(july.contracted, 100000);
    assert.equal(july.raised, 0, "July was never marked");
    assert.equal(july.leakage, 100000, "contracted but never billed");
    assert.equal(july.lag, 0);
  });
});

describe("collection speed", () => {
  test("days-to-payment is measured between the two ticks", async () => {
    await db.query(
      `UPDATE foundery.raised_invoices
       SET raised_at = '2026-08-01', paid_at = '2026-08-21' WHERE month = '2026-08'`,
    );
    const speed = await collectionSpeed();
    assert.deepEqual(speed, [
      { clientName: "Steady", termsDays: 15, avgDays: 20, samples: 1 },
    ]);
  });
});
