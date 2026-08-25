import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { setupTempDb, TODAY } from "./helpers.mjs";

setupTempDb("redaction");

const { getDb, setSetting } = await import("../src/lib/db");
const { listClients, listCosts, costTotals, billingTasks, reminders } = await import("../src/lib/queries");
const { policyFor } = await import("../src/lib/policy");

const db = await getDb();

const [kidology] = await db.query<{ id: number }>(
  `INSERT INTO foundery.clients (name, slug, status, engagement, vip, services, retainer_amount,
     delivery_cost, start_date, billing_day, terms_days, health)
   VALUES ('Kidology','kidology','active','retainer',true,'["UGC"]','185000','82000','2026-01-01',1,15,'green')
   RETURNING id`,
);
await db.query(
  `INSERT INTO foundery.clients (name, slug, status, engagement, vip, services, one_time_value,
     delivery_cost, start_date, end_date, billing_day, terms_days, health)
   VALUES ('Nordwell','nordwell','active','one_time',false,'["Web"]','300000','60000','2026-07-01','2026-09-30',1,15,'amber')`,
);

const salaries: [string, string, number][] = [
  ["Media buyer", "Priya Nair", 95000],
  ["Creative strategist", "Aditya Rao", 78000],
];
for (const [label, person, amount] of salaries) {
  await db.query(
    `INSERT INTO foundery.costs (category, label, person, amount, cadence, start_date, active)
     VALUES ('salary', $1, $2, $3, 'monthly', '2026-01-01', true)`,
    [label, person, amount],
  );
}
await db.query(
  `INSERT INTO foundery.costs (category, label, amount, cadence, start_date, active)
   VALUES ('tools','Figma',3600,'monthly','2026-01-01',true),
          ('tools','Adobe',84000,'annual','2026-01-01',true)`,
);

describe("costs: a person's pay never reaches an operator", () => {
  test("operator gets one aggregate salary row with no names and no split", async () => {
    const rows = await listCosts("operator");
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

  test("founder gets every salary line intact", async () => {
    const rows = (await listCosts("founder")).filter((row) => row.category === "salary");
    assert.equal(rows.length, 2);
    assert.deepEqual(
      rows.map((row) => row.person).sort(),
      ["Aditya Rao", "Priya Nair"],
    );
    assert.equal(rows.every((row) => row.editable), true);
  });

  test("non-sensitive categories stay itemised for the operator", async () => {
    const tools = (await listCosts("operator")).filter((row) => row.category === "tools");
    assert.equal(tools.length, 2);
    assert.ok(tools.some((row) => row.label === "Figma"));
  });

  test("an annual cost is counted at a twelfth of the monthly base", async () => {
    const tools = (await costTotals()).find((row) => row.category === "tools")!;
    assert.equal(tools.total, 3600 + 84000 / 12);
  });
});

describe("clients: values follow the founder's switch", () => {
  test("operator sees names and services but no money by default", async () => {
    const [client] = await listClients("operator");
    assert.equal(client.name, "Kidology");
    assert.equal(client.vip, true);
    assert.deepEqual(client.services, ["UGC"]);
    assert.equal(client.retainer_amount, null);
    assert.equal(client.delivery_cost, null);
    assert.equal(client.health, null, "health is a commercial judgement, not an operational one");

    assert.ok(!JSON.stringify(await listClients("operator")).includes("185000"));
  });

  test("founder sees the money", async () => {
    const [client] = await listClients("founder");
    assert.equal(client.retainer_amount, 185000);
    assert.equal(client.health, "green");
  });

  test("turning the switch on opens client values to the operator", async () => {
    await setSetting("operator_sees_client_values", "1");
    assert.equal((await policyFor("operator")).clientValues, true);
    assert.equal((await listClients("operator"))[0].retainer_amount, 185000);
    await setSetting("operator_sees_client_values", "0");
    assert.equal((await listClients("operator"))[0].retainer_amount, null);
  });

  test("no switch can open individual salaries", async () => {
    await setSetting("operator_sees_client_values", "1");
    assert.equal((await policyFor("operator")).costLineItems("salary"), false);
    assert.ok(!JSON.stringify(await listCosts("operator")).includes("Priya Nair"));
    await setSetting("operator_sees_client_values", "0");
  });
});

describe("billing tasks: raised in Zoho, ticked off here", () => {
  test("an active retainer gets a task for last month and this month; a project gets none", async () => {
    const tasks = await billingTasks("founder", TODAY);
    assert.deepEqual(
      tasks.map((task) => [task.clientName, task.month, task.raised]),
      [
        ["Kidology", "2026-07", false],
        ["Kidology", "2026-08", false],
      ],
      "Nordwell is a one-off project — its invoices are raised straight in Zoho",
    );
    assert.equal(tasks[0].raiseOn, "2026-07-01");
  });

  test("amounts follow the client-values switch; names and dates never hide", async () => {
    const [task] = await billingTasks("operator", TODAY);
    assert.equal(task.amount, null);
    assert.equal(task.clientName, "Kidology");
    assert.equal(task.billingDay, 1);
    await setSetting("operator_sees_client_values", "1");
    assert.equal((await billingTasks("operator", TODAY))[0].amount, 185000);
    await setSetting("operator_sees_client_values", "0");
  });

  test("a retainer that started this month owes nothing for last month", async () => {
    await db.query(
      `INSERT INTO foundery.clients (name, slug, status, engagement, services, retainer_amount,
         start_date, billing_day, terms_days)
       VALUES ('Fresh Signing','fresh','active','retainer','[]',50000,'2026-08-15',20,15)`,
    );
    const months = (await billingTasks("founder", TODAY))
      .filter((task) => task.clientName === "Fresh Signing")
      .map((task) => task.month);
    assert.deepEqual(months, ["2026-08"]);
    await db.query(`DELETE FROM foundery.clients WHERE slug = 'fresh'`);
  });
});

describe("reminders", () => {
  test("a missed month outranks this month's late raise", async () => {
    const feed = await reminders("founder", TODAY);
    assert.deepEqual(
      feed.map((item) => item.kind),
      ["missed", "to_raise"],
    );
    assert.ok(feed[0].title.includes("was never raised"));
    assert.ok(feed[1].title.includes("late going out"));
  });

  test("marking the month raised clears its nudge", async () => {
    await db.query(
      `INSERT INTO foundery.raised_invoices (client_id, month, raised_by) VALUES ($1, '2026-08', 'founder')`,
      [kidology.id],
    );
    const feed = await reminders("founder", TODAY);
    assert.equal(feed.filter((item) => item.kind === "to_raise").length, 0);
    assert.equal(feed.filter((item) => item.kind === "missed").length, 1, "July is still open");
  });

  test("marking the missed month empties the feed", async () => {
    await db.query(
      `INSERT INTO foundery.raised_invoices (client_id, month, raised_by) VALUES ($1, '2026-07', 'founder')`,
      [kidology.id],
    );
    assert.deepEqual(await reminders("founder", TODAY), []);
    const tasks = await billingTasks("founder", TODAY);
    assert.equal(tasks.every((task) => task.raised), true);
  });

  test("the payment tick is a second state on top of raised", async () => {
    const before = (await billingTasks("founder", TODAY)).find((task) => task.month === "2026-08")!;
    assert.equal(before.raised, true);
    assert.equal(before.paid, false, "raised alone is not paid");

    await db.query(
      `UPDATE foundery.raised_invoices SET paid_at = now(), paid_by = 'founder'
       WHERE client_id = $1 AND month = '2026-08'`,
      [kidology.id],
    );
    const after = (await billingTasks("founder", TODAY)).find((task) => task.month === "2026-08")!;
    assert.equal(after.paid, true);
    assert.ok(after.paidAt, "the paid date travels with the task");
    const july = (await billingTasks("founder", TODAY)).find((task) => task.month === "2026-07")!;
    assert.equal(july.paid, false, "each month carries its own tick");
  });
});
