import type { Metadata } from "next";
import { requireFounder } from "@/lib/auth";
import { pnl, pnlTotals } from "@/lib/analytics";
import { defaultCurrency, fmtMoney, fmtPct, symbolFor } from "@/lib/money";
import { monthKey } from "@/lib/dates";
import {
  Card, CardTitle, PageBody, PageHeader, ProfitBars, StatTile, TableWrap, Td, Th,
} from "@/components/ui/primitives";
import { Ticker } from "@/components/ui/ticker";
import { MonthEditor } from "./month-editor";

export const metadata: Metadata = { title: "Profit & P&L" };
export const dynamic = "force-dynamic";

export default async function PnlPage() {
  await requireFounder();

  const currency = defaultCurrency();
  const symbol = symbolFor(currency);

  const months = await pnl(12);
  const totals = pnlTotals(months);
  const current = monthKey();
  const withData = months.filter((month) => month.hasData);

  return (
    <>
      <PageHeader title="Profit & P&L" subtitle="Twelve months, month by month" />

      <PageBody width={1120}>
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label={`Revenue · ${totals.months} months`}
            count={<Ticker value={totals.revenue} format="compact" currency={currency} />}
            tone="var(--color-series-1)"
            hint="Contracted revenue, month by month"
          />
          <StatTile
            label="Costs"
            count={<Ticker value={totals.costs} format="compact" currency={currency} />}
            tone="var(--color-series-2)"
            hint="Everything that went out"
          />
          <StatTile
            label="Profit after tax"
            count={<Ticker value={totals.profit} format="compact" currency={currency} />}
            tone={totals.profit < 0 ? "var(--color-critical)" : "var(--color-good)"}
            hint={totals.marginPct === null ? "No revenue recorded" : `${fmtPct(totals.marginPct, 0)} margin`}
          />
          <StatTile
            label="Best month"
            value={totals.bestMonth ? totals.bestMonth.label.split(" ")[0] : "—"}
            hint={
              totals.bestMonth
                ? `${fmtMoney(totals.bestMonth.profit, currency)} profit`
                : "Nothing to compare yet"
            }
          />
        </div>

        <Card>
          <CardTitle
            title="Profit by month"
            hint="Up is a month that paid for itself. Down is one that didn't — and it's drawn below the line so you can't miss it."
          />
          {withData.length === 0 ? (
            <p className="py-10 text-center text-[13px] text-[var(--color-ink-3)]">
              No months have any figures in them yet. Add clients with values or a cost and this fills in.
            </p>
          ) : (
            <ProfitBars
              points={withData.map((month) => ({
                label: month.label.split(" ")[0],
                value: month.profit,
                hint: `${month.label}: ${fmtMoney(month.profit, currency)}`,
              }))}
              height={160}
            />
          )}
        </Card>

        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="The statement"
              hint="Revenue from the contracted book — retainers plus project slices, month by month — costs from the cost base as it stood, plus anything you added by hand. Actual billing lives in Zoho."
            />
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Month</Th>
                <Th align="right">Contracted</Th>
                <Th align="right">Other income</Th>
                <Th align="right">Costs</Th>
                <Th align="right">Before tax</Th>
                <Th align="right">Tax</Th>
                <Th align="right">Profit</Th>
                <Th align="right">Margin</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {[...months].reverse().map((month) => (
                <tr
                  key={month.month}
                  className={`transition-colors hover:bg-[var(--color-surface-2)] ${
                    month.month === current ? "bg-[var(--color-surface-2)]" : ""
                  }`}
                >
                  <Td>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="font-medium">{month.label}</span>
                      {month.month === current && (
                        <span className="shrink-0 text-[10.5px] text-[var(--color-ink-3)]">so far</span>
                      )}
                      {month.closed && (
                        <span
                          title="Books closed"
                          aria-label="Books closed"
                          className="h-1.5 w-1.5 shrink-0 rounded-full"
                          style={{ background: "var(--color-good)" }}
                        />
                      )}
                    </div>
                    {month.notes && (
                      <p className="mt-0.5 max-w-[220px] truncate text-[11px] text-[var(--color-ink-3)]">
                        {month.notes}
                      </p>
                    )}
                  </Td>

                  {/* Rule 20: a month with nothing in it shows a dash, not a
                      confident zero that reads as "we earned nothing". */}
                  {!month.hasData ? (
                    <>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                      <Td align="right" className="text-[var(--color-ink-3)]">—</Td>
                    </>
                  ) : (
                    <>
                      <Td align="right">
                        <span className="tabular">
                          {fmtMoney(month.contracted, currency)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tabular text-[var(--color-ink-2)]">
                          {month.otherIncome ? fmtMoney(month.otherIncome, currency) : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tabular text-[var(--color-ink-2)]">
                          {fmtMoney(month.costs, currency)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tabular">{fmtMoney(month.profitBeforeTax, currency)}</span>
                      </Td>
                      <Td align="right">
                        <span className="tabular text-[var(--color-ink-2)]">
                          {month.tax ? fmtMoney(month.tax, currency) : "—"}
                        </span>
                      </Td>
                      <Td align="right">
                        <span
                          className="tabular font-semibold"
                          style={{
                            color: month.profit < 0 ? "var(--color-critical)" : "var(--color-good)",
                          }}
                        >
                          {fmtMoney(month.profit, currency)}
                        </span>
                      </Td>
                      <Td align="right">
                        <span className="tabular text-[var(--color-ink-2)]">
                          {month.marginPct === null ? "—" : fmtPct(month.marginPct, 0)}
                        </span>
                      </Td>
                    </>
                  )}

                  <Td align="right">
                    <MonthEditor
                      month={{
                        month: month.month,
                        label: month.label,
                        otherIncome: month.otherIncome,
                        oneOffCosts: month.oneOffCosts,
                        taxRatePct: month.taxRatePct,
                        notes: month.notes,
                        closed: month.closed,
                      }}
                      currencySymbol={symbol}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>
      </PageBody>
    </>
  );
}
