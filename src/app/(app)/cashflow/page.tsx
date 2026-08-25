import type { Metadata } from "next";
import { Crown, PiggyBank } from "lucide-react";
import { requireFounder } from "@/lib/auth";
import { billingHonesty, cashCalendar, collectionSpeed } from "@/lib/cashflow";
import { defaultCurrency, fmtCompact, fmtMoney, symbolFor } from "@/lib/money";
import { prettyDate, todayISO } from "@/lib/dates";
import {
  BarRow, Card, CardTitle, Chip, EmptyState, PageBody, PageHeader, ProfitBars, StatTile,
  TableWrap, Td, Th,
} from "@/components/ui/primitives";
import { Ticker } from "@/components/ui/ticker";
import { CashPositionForm } from "./cash-position-form";

export const metadata: Metadata = { title: "Cashflow" };
export const dynamic = "force-dynamic";

const INFLOW_STATUS = {
  overdue: { label: "Overdue", tone: "var(--color-critical)" },
  raised: { label: "Raised", tone: "var(--color-series-1)" },
  upcoming: { label: "Upcoming", tone: "var(--color-ink-3)" },
} as const;

/**
 * Monthly profit and mid-month cash are two different businesses. This page
 * is the second one: when money actually lands, when it actually leaves, and
 * whether the line between them ever dips below zero.
 */
export default async function CashflowPage() {
  await requireFounder();
  const today = todayISO();
  const currency = defaultCurrency();

  const [calendar, honesty, speed] = await Promise.all([
    cashCalendar(today),
    billingHonesty(today),
    collectionSpeed(),
  ]);

  const thisWeek = calendar.weeks[0];
  const honestyMax = Math.max(1, ...honesty.map((m) => m.contracted));

  return (
    <>
      <PageHeader
        title="Cashflow"
        subtitle="When the money actually moves — not when the month says it should"
      />
      <PageBody width={1120}>
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="In the bank"
            count={
              calendar.openingBalance === null ? "—" : (
                <Ticker value={calendar.openingBalance} format="compact" currency={currency} />
              )
            }
            tone="var(--color-series-1)"
            hint={calendar.openingBalance === null ? "Set it below to project the line" : "As last updated below"}
          />
          <StatTile
            label="Expected in 30 days"
            count={<Ticker value={calendar.in30Days} format="compact" currency={currency} />}
            tone="var(--color-good)"
            hint={`${calendar.inflows.filter((i) => i.status === "overdue").length} of ${calendar.inflows.length} payments already late`}
          />
          <StatTile
            label="This week"
            count={<Ticker value={thisWeek?.net ?? 0} format="compact" currency={currency} />}
            tone={thisWeek && thisWeek.net < 0 ? "var(--color-warning)" : "var(--color-good)"}
            hint={`${fmtCompact(thisWeek?.inflow ?? 0, currency)} in · ${fmtCompact(thisWeek?.outflow ?? 0, currency)} out`}
          />
          <StatTile
            label="Lowest point"
            count={
              calendar.low === null ? "—" : (
                <Ticker value={calendar.low.balance} format="compact" currency={currency} />
              )
            }
            tone={
              calendar.low && calendar.low.balance < 0
                ? "var(--color-critical)"
                : "var(--color-series-5)"
            }
            hint={calendar.low ? `Week of ${calendar.low.label}` : "Needs a bank balance"}
          />
        </div>

        <Card>
          <CardTitle
            title="Cash position"
            hint="Everything else on this page is derived — this is the one number only you know."
          />
          <CashPositionForm
            balance={calendar.openingBalance}
            salaryDay={calendar.salaryDay}
            currencySymbol={symbolFor(currency)}
          />
        </Card>

        {/* ------------------------------------------------ ten-week line */}
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="The next ten weeks"
              hint={`Money in from raised and upcoming invoices (billing day + each client's terms), salaries out on day ${calendar.salaryDay}, other costs dripping daily. Late payments are expected this week, not written off.`}
            />
            <ProfitBars
              points={calendar.weeks.map((week) => ({
                label: week.label.split("–")[0],
                value: week.net,
                hint: `${week.label}: ${fmtMoney(week.inflow, currency)} in, ${fmtMoney(week.outflow, currency)} out${
                  week.balance !== null ? ` → ${fmtCompact(week.balance, currency)} in the bank` : ""
                }`,
              }))}
            />
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Week</Th>
                <Th align="right">In</Th>
                <Th align="right">Out</Th>
                <Th align="right">Net</Th>
                <Th align="right">Projected balance</Th>
              </tr>
            </thead>
            <tbody>
              {calendar.weeks.map((week) => (
                <tr key={week.start} className="transition-colors hover:bg-[var(--color-surface-2)]">
                  <Td>{week.label}</Td>
                  <Td align="right">
                    <span className="tabular">{week.inflow ? fmtMoney(week.inflow, currency) : "—"}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-[var(--color-ink-2)]">
                      {fmtMoney(week.outflow, currency)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span
                      className="tabular font-medium"
                      style={{ color: week.net < 0 ? "var(--color-warning)" : "var(--color-good)" }}
                    >
                      {fmtMoney(week.net, currency)}
                    </span>
                  </Td>
                  <Td align="right">
                    {week.balance === null ? (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    ) : (
                      <span
                        className="tabular font-semibold"
                        style={{ color: week.balance < 0 ? "var(--color-critical)" : undefined }}
                      >
                        {fmtMoney(week.balance, currency)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrap>
        </Card>

        {/* -------------------------------------------- expected payments */}
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="Money on its way"
              hint="Every payment the calendar is counting on, in landing order. An overdue one is expected this week — chase it and the week improves."
            />
          </div>
          {calendar.inflows.length === 0 ? (
            <EmptyState
              icon={<PiggyBank size={22} />}
              title="Nothing expected"
              hint="Raise invoices on the Invoices page and their expected landings appear here."
            />
          ) : (
            <ul className="stagger divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {calendar.inflows.map((inflow, index) => {
                const status = INFLOW_STATUS[inflow.status];
                return (
                  <li key={`${inflow.clientName}-${inflow.monthLabel}-${index}`} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="flex flex-wrap items-center gap-1.5 text-[13px] font-medium">
                        <span className="min-w-0 truncate">{inflow.clientName}</span>
                        {inflow.vip && (
                          <span title="VIP account" className="inline-flex shrink-0 items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold" style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}>
                            <Crown size={9} aria-hidden />
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">{inflow.monthLabel} invoice</p>
                    </div>
                    <Chip tone={status.tone}>{status.label}</Chip>
                    <div className="shrink-0 text-right">
                      <p className="tabular text-[13px] font-semibold">{fmtMoney(inflow.amount, currency)}</p>
                      <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
                        {inflow.status === "overdue" ? "was due " : "expected "}
                        {prettyDate(inflow.expectedOn)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        {/* ---------------------------------- contracted vs raised vs paid */}
        <Card>
          <CardTitle
            title="Contracted vs raised vs collected"
            hint="Three numbers per month that should be equal and never are. The first gap is work never billed; the second is bills not yet paid."
          />
          <div className="space-y-5">
            {honesty.map((month) => (
              <div key={month.month}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <p className="text-[12.5px] font-semibold">{month.label}</p>
                  <p className="text-[11.5px] text-[var(--color-ink-3)]">
                    {month.leakage > 0 && `${fmtCompact(month.leakage, currency)} never billed`}
                    {month.leakage > 0 && month.lag > 0 && " · "}
                    {month.lag > 0 && `${fmtCompact(month.lag, currency)} awaiting payment`}
                    {month.leakage === 0 && month.lag === 0 && month.contracted > 0 && "fully collected"}
                  </p>
                </div>
                <BarRow label="Contracted" value={month.contracted} total={honestyMax} tone="var(--color-series-3)" right={fmtMoney(month.contracted, currency)} />
                <BarRow label="Raised" value={month.raised} total={honestyMax} tone="var(--color-series-1)" right={fmtMoney(month.raised, currency)} />
                <BarRow label="Collected" value={month.collected} total={honestyMax} tone="var(--color-good)" right={fmtMoney(month.collected, currency)} />
              </div>
            ))}
          </div>
        </Card>

        {/* --------------------------------------------- collection speed */}
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="Who actually pays on time"
              hint="Measured between your own two ticks — raise to paid. Net terms are a claim; this is the record."
            />
          </div>
          {speed.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--color-ink-3)]">
              Builds itself as you tick payments received — nothing measured yet.
            </p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>Client</Th>
                  <Th align="right">Their terms</Th>
                  <Th align="right">Actually pays in</Th>
                  <Th align="right">Invoices measured</Th>
                </tr>
              </thead>
              <tbody>
                {speed.map((row) => (
                  <tr key={row.clientName} className="transition-colors hover:bg-[var(--color-surface-2)]">
                    <Td>
                      <span className="font-medium">{row.clientName}</span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-[var(--color-ink-2)]">net {row.termsDays}</span>
                    </Td>
                    <Td align="right">
                      <span
                        className="tabular font-semibold"
                        style={{
                          color:
                            row.avgDays > row.termsDays + 7
                              ? "var(--color-critical)"
                              : row.avgDays > row.termsDays
                                ? "var(--color-warning)"
                                : "var(--color-good)",
                        }}
                      >
                        {row.avgDays} {row.avgDays === 1 ? "day" : "days"}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-[var(--color-ink-2)]">{row.samples}</span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>
      </PageBody>
    </>
  );
}
