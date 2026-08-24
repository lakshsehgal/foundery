import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { policyFor } from "@/lib/policy";
import { clientOptions, listInvoices, nextInvoiceNumber, reminders } from "@/lib/queries";
import { defaultCurrency, fmtMoney, symbolFor } from "@/lib/money";
import { prettyDate, todayISO } from "@/lib/dates";
import { PageBody, PageHeader, PolicyNote, StatTile } from "@/components/ui/primitives";
import { Ticker } from "@/components/ui/ticker";
import { InvoicesView, type InvoiceRowDisplay } from "./invoices-view";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

export default async function InvoicesPage() {
  const role = await requireRole();
  const currency = defaultCurrency();
  const today = todayISO();

  const [policy, invoices, feed, clients, suggestedNumber] = await Promise.all([
    policyFor(role),
    listInvoices(role, today),
    reminders(role, today),
    clientOptions(),
    nextInvoiceNumber(),
  ]);

  const rows: InvoiceRowDisplay[] = invoices.map((invoice) => ({
    ...invoice,
    amountLabel: invoice.amount === null ? null : fmtMoney(invoice.amount, currency),
    outstandingLabel:
      invoice.outstanding === null
        ? null
        : invoice.status === "paid" || invoice.status === "void"
          ? "—"
          : fmtMoney(invoice.outstanding, currency),
    issueLabel: prettyDate(invoice.issue_date),
    dueLabel: prettyDate(invoice.due_date),
  }));

  const open = invoices.filter((i) => i.status !== "paid" && i.status !== "void");
  const overdue = open.filter((i) => i.overdue);
  const outstanding = open.reduce((sum, i) => sum + (i.outstanding ?? 0), 0);
  const overdueTotal = overdue.reduce((sum, i) => sum + (i.outstanding ?? 0), 0);
  const toRaise = feed.filter((r) => r.kind === "to_raise").length;

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle={`${open.length} open · ${overdue.length} overdue${toRaise ? ` · ${toRaise} still to raise` : ""}`}
      />
      <PageBody width={1160}>
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Owed to us"
            count={
              policy.invoiceAmounts ? (
                <Ticker value={outstanding} format="compact" currency={currency} />
              ) : (
                "—"
              )
            }
            tone="var(--color-series-1)"
            hint={`${open.length} invoice${open.length === 1 ? "" : "s"} open`}
          />
          <StatTile
            label="Past due"
            count={
              policy.invoiceAmounts ? (
                <Ticker value={overdueTotal} format="compact" currency={currency} />
              ) : (
                <Ticker value={overdue.length} />
              )
            }
            tone={overdue.length > 0 ? "var(--color-critical)" : "var(--color-good)"}
            hint={
              overdue.length === 0
                ? "Nothing has gone past its date"
                : `${overdue.length} invoice${overdue.length === 1 ? "" : "s"}, oldest first`
            }
          />
          <StatTile
            label="Still to raise"
            count={<Ticker value={toRaise} />}
            tone={toRaise > 0 ? "var(--color-warning)" : undefined}
            hint={toRaise === 0 ? "This month is fully billed" : "Retainers not yet billed this month"}
          />
          <StatTile
            label="Settled"
            count={<Ticker value={invoices.filter((i) => i.status === "paid").length} />}
            tone="var(--color-good)"
            hint="Paid in full, all time"
          />
        </div>

        {!policy.invoiceAmounts && (
          <PolicyNote>
            Amounts are hidden on your view. Dates, terms and whether something is paid are all here,
            which is everything you need to chase one.
          </PolicyNote>
        )}

        <InvoicesView
          invoices={rows}
          clients={clients.map((c) => ({ id: c.id, name: c.name, terms_days: c.terms_days }))}
          canEditAmounts={role === "founder"}
          canDelete={role === "founder"}
          currencySymbol={symbolFor(currency)}
          suggestedNumber={suggestedNumber}
          today={today}
        />
      </PageBody>
    </>
  );
}
