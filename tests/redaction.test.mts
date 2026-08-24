import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { useTempDb, TODAY } from "./helpers.mjs";

useTempDb("redaction");

const { getDb, setSetting } = await import("../src/lib/db");
const { listClients, listCosts, costTotals, listInvoices, reminders } = await import("../src/lib/queries");
const { policyFor } = await import("../src/lib/policy");

const db = getDb();

db.prepare(
  `INSERT INTO clients (name, slug, status, engagement, vip, services, retainer_amount,
     delivery_cost, start_date, billing_day, terms_days, health)
   VALUES ('Kidology','kidology','active','retainer',1,'["UGC"]',185000,82000,'2026-01-01',1,15,'green')`,
).run();
db.prepare(
  `INSERT INTO clients (name, slug, status, engagement, vip, services, one_time_value,
     delivery_cost, start_date, end_date, billing_day, terms_days, health)
   VALUES ('Nordwell','nordwell','active','one_time',0,'["Web"]',300000,60000,'2026-07-01','2026-09-30',1,15,'amber')`,
).run();

const salaries: [string, string, number][] = [
  ["Media buyer", "Priya Nair", 95000],
  ["Creative strategist", "Aditya Rao", 78000],
];
for (const [label, person, amount] of salaries) {
  db.prepare(
    `INSERT INTO costs (category, label, person, amount, cadence, start_date, active)
     VALUES ('salary', ?, ?, ?, 'monthly', '2026-01-01', 1)`,
  ).run(label, person, amount);
}
db.prepare(
  `INSERT INTO costs (category, label, amount, cadence, start_date, active)
   VALUES ('tools','Figma',3600,'monthly','2026-01-01',1)`,
).run();
db.prepare(
  `INSERT INTO costs (category, label, amount, cadence, start_date, active)
   VALUES ('tools','Adobe',84000,'annual','2026-01-01',1)`,
).run();

db.prepare(
  `INSERT INTO invoices (client_id, number, issue_date, due_date, terms_days, amount, amount_paid, status)
   VALUES (1,'NRD-1','2026-07-20','2026-08-04',15,185000,0,'sent')`,
).run();

describe("costs: a person's pay never reaches an operator", () => {
  test("operator gets one aggregate salary row with no names and no split", () => {
    const rows = listCosts("operator");
    const salaryRows = rows.filter((row) => row.category === "salary");

    assert.equal(salaryRows.length, 1, "salaries collapse to a single line");
    const [aggregate] = salaryRows;
    assert.equal(aggregate.aggregated, true);
    assert.equal(aggregate.person, null);
    assert.equal(aggregate.id, null, "no row id, so nothing can be looked up or edited");
    assert.equal(aggregate.editable, false);
    assert.equal(aggregate.count, 2);
    assert.equal(aggregate.amount, 173000, "the category total is visible");

    // The real test: no individual figure or name survives serialisation.
    const serialised = JSON.stringify(rows);
    for (const [label, person, amount] of salaries) {
      assert.ok(!serialised.includes(person), `${person} must not be present`);
      assert.ok(!serialised.includes(String(amount)), `${amount} must not be present`);
      assert.ok(!serialised.includes(label), `${label} must not be present`);
    }
  });

  test("founder gets every salary line intact", () => {
    const rows = listCosts("founder").filter((row) => row.category === "salary");
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.person).sort(),
      ["Aditya Rao", "Priya Nair"],
    );
    assert.equal(rows.every((row) => row.editable), true);
  });

  test("non-sensitive categories stay itemised for the operator", () => {
    const tools = listCosts("operator").filter((row) => row.category === "tools");
    assert.equal(tools.length, 2);
    assert.ok(tools.some((row) => row.label === "Figma"));
  });

  test("an annual cost is counted at a twelfth of the monthly base", () => {
    const tools = costTotals().find((row) => row.category === "tools")!;
    assert.equal(tools.total, 3600 + 84000 / 12);
  });
});

describe("clients: values follow the founder's switch", () => {
  test("operator sees names and services but no money by default", () => {
    const [client] = listClients("operator");
    assert.equal(client.name, "Kidology");
    assert.equal(client.vip, true);
    assert.deepEqual(client.services, ["UGC"]);
    assert.equal(client.retainer_amount, null);
    assert.equal(client.delivery_cost, null);
    assert.equal(client.health, null, "health is a commercial judgement, not an operational one");

    assert.ok(!JSON.stringify(listClients("operator")).includes("185000"));
  });

  test("founder sees the money", () => {
    const [client] = listClients("founder");
    assert.equal(client.retainer_amount, 185000);
    assert.equal(client.health, "green");
  });

  test("turning the switch on opens client values to the operator", () => {
    setSetting("operator_sees_client_values", "1");
    assert.equal(policyFor("operator").clientValues, true);
    assert.equal(listClients("operator")[0].retainer_amount, 185000);
    setSetting("operator_sees_client_values", "0");
    assert.equal(listClients("operator")[0].retainer_amount, null);
  });

  test("no switch can open individual salaries", () => {
    setSetting("operator_sees_client_values", "1");
    setSetting("operator_sees_invoice_amounts", "1");
    assert.equal(policyFor("operator").costLineItems("salary"), false);
    assert.ok(!JSON.stringify(listCosts("operator")).includes("Priya Nair"));
    setSetting("operator_sees_client_values", "0");
  });
});

describe("invoices", () => {
  test("amounts follow the switch, dates and status never do", () => {
    setSetting("operator_sees_invoice_amounts", "0");
    const [invoice] = listInvoices("operator", TODAY);
    assert.equal(invoice.amount, null);
    assert.equal(invoice.outstanding, null);
    assert.equal(invoice.due_date, "2026-08-04", "dates stay, so the operator can still chase");
    assert.equal(invoice.status, "sent");
    assert.equal(invoice.overdue, true);
    setSetting("operator_sees_invoice_amounts", "1");
    assert.equal(listInvoices("operator", TODAY)[0].amount, 185000);
  });

  test("overdue is counted in whole days from the due date", () => {
    const [invoice] = listInvoices("founder", TODAY);
    assert.equal(invoice.daysUntilDue, -20);
  });

  test("a paid invoice stops counting down", () => {
    getDb()
      .prepare(`UPDATE invoices SET status='paid', amount_paid=amount, paid_date=? WHERE number='NRD-1'`)
      .run(TODAY);
    const [invoice] = listInvoices("founder", TODAY);
    assert.equal(invoice.daysUntilDue, null);
    assert.equal(invoice.overdue, false);
    getDb().prepare(`UPDATE invoices SET status='sent', amount_paid=0, paid_date=NULL WHERE number='NRD-1'`).run();
  });
});

describe("reminders", () => {
  test("an unbilled retainer is surfaced even though no invoice exists to list", () => {
    // Kidology has a July invoice, not an August one, and bills on the 1st.
    const feed = reminders("founder", TODAY);
    const toRaise = feed.filter((item) => item.kind === "to_raise");
    assert.equal(toRaise.length, 1);
    assert.equal(toRaise[0].clientName, "Kidology");
    assert.ok(toRaise[0].title.includes("late going out"));
  });

  test("raising this month's invoice clears the nudge", () => {
    getDb()
      .prepare(
        `INSERT INTO invoices (client_id, number, issue_date, due_date, terms_days, amount, status)
         VALUES (1,'NRD-2','2026-08-01','2026-08-16',15,185000,'sent')`,
      )
      .run();
    const feed = reminders("founder", TODAY);
    assert.equal(feed.filter((item) => item.kind === "to_raise").length, 0);
  });

  test("overdue sorts ahead of due-soon", () => {
    const kinds = reminders("founder", TODAY).map((item) => item.kind);
    assert.deepEqual(kinds, [...kinds].sort((a, b) => (a === "overdue" ? -1 : 1)));
    assert.equal(kinds[0], "overdue");
  });
});
