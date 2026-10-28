import type { Metadata } from "next";
import { AlertTriangle, ShieldCheck, TriangleAlert } from "lucide-react";
import { requireFinance } from "@/lib/auth";
import {
  clientEconomics, efficiency, headline, mediaBuyerLoad, projection, riskReport, serviceRevenue,
} from "@/lib/analytics";
import { costTotals } from "@/lib/queries";
import { defaultCurrency, fmtCompact, fmtMoney, fmtPct } from "@/lib/money";
import { CATEGORY_LABEL, CATEGORY_TONE, HEALTH } from "@/lib/taxonomy";
import {
  BarRow, Card, CardTitle, Chip, PageBody, PageHeader, ProfitBars, StatTile,
  TableWrap, Td, Th,
} from "@/components/ui/primitives";
import { Ticker } from "@/components/ui/ticker";

export const metadata: Metadata = { title: "Founder dashboard" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<string, string> = {
  good: "var(--color-good)",
  warning: "var(--color-warning)",
  serious: "var(--color-serious)",
  critical: "var(--color-critical)",
};

const BAND_COPY = {
  steady: {
    label: "Steady",
    tone: "var(--color-good)",
    line: "Nothing here would end the business this quarter.",
    icon: ShieldCheck,
  },
  watch: {
    label: "Watch",
    tone: "var(--color-warning)",
    line: "One or two things would hurt if they went wrong at the same time.",
    icon: TriangleAlert,
  },
  exposed: {
    label: "Exposed",
    tone: "var(--color-critical)",
    line: "There is a real chance of a bad quarter. Work the red items first.",
    icon: AlertTriangle,
  },
} as const;

export default async function FounderPage() {
  await requireFinance();

  const currency = defaultCurrency();
  const [head, economics, forecast, risk, totals, buyerLoad, services] = await Promise.all([
    headline(),
    clientEconomics(),
    projection(6),
    riskReport(),
    costTotals(),
    mediaBuyerLoad(),
    serviceRevenue(),
  ]);
  const burn = totals.reduce((sum, row) => sum + row.total, 0);
  const lever = efficiency(head, totals);
  const band = BAND_COPY[risk.band];
  const BandIcon = band.icon;

  // The two lines of business, each with its own subtotal and its own units:
  // performance retainers are monthly money; creative one-offs are whole
  // contracts, landing in the month they kick off.
  const books = [
    {
      key: "retainer",
      label: "Performance — retainers",
      hint: "Per month · renews by itself",
      tone: "var(--color-series-1)",
      clients: economics.filter((c) => c.engagement === "retainer"),
    },
    {
      key: "one_time",
      label: "Creative — one-off projects",
      hint: "Whole contract · lands in the kickoff month, costs run across its months",
      tone: "var(--color-series-4)",
      clients: economics.filter((c) => c.engagement !== "retainer"),
    },
  ]
    .map((book) => ({
      ...book,
      value: book.clients.reduce((sum, c) => sum + c.bookValue, 0),
      deliveryCost: book.clients.reduce((sum, c) => sum + c.deliveryCost, 0),
    }))
    .filter((book) => book.clients.length > 0);

  return (
    <>
      <PageHeader title="Founder dashboard" subtitle="Margins, what's coming, and what could go wrong" />
      <PageBody width={1120}>
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Revenue this month"
            count={<Ticker value={head.revenue} format="compact" currency={currency} />}
            tone="var(--color-series-1)"
            hint={`${fmtCompact(head.performance, currency)} performance · ${fmtCompact(head.creative, currency)} creative landing now`}
          />
          <StatTile
            label="Monthly cost base"
            count={<Ticker value={head.burn} format="compact" currency={currency} />}
            tone="var(--color-series-2)"
            hint="Salaries, tools, contractors, everything"
          />
          <StatTile
            label="Net profit / month"
            count={<Ticker value={head.netProfit} format="compact" currency={currency} />}
            tone={head.netProfit < 0 ? "var(--color-critical)" : "var(--color-good)"}
            hint={head.netMarginPct === null ? "No revenue to divide by" : `${fmtPct(head.netMarginPct, 0)} margin`}
          />
          <StatTile
            label="Runway"
            count={
              head.runwayMonths === null ? "—" : <Ticker value={head.runwayMonths} digits={1} />
            }
            unit={head.runwayMonths === null ? undefined : "months"}
            hint={
              head.runwayMonths === null
                ? "Add a cash buffer in settings"
                : `On ${fmtCompact(head.cashBuffer ?? 0, currency)} in the bank, no new revenue`
            }
          />
        </div>

        {/* --------------------------------------------------------- risk */}
        <Card>
          <div className="flex flex-wrap items-start gap-4">
            <div className="min-w-0 flex-1">
              <CardTitle
                title="Risk"
                hint="The six ways a small agency actually gets hurt, scored against your own numbers."
              />
            </div>
            <div
              className="flex shrink-0 items-center gap-2.5 rounded-[var(--radius-md)] px-3 py-2"
              style={{ background: `color-mix(in srgb, ${band.tone} 12%, transparent)` }}
            >
              <BandIcon size={16} style={{ color: band.tone }} />
              <div>
                <p className="text-[13px] font-semibold" style={{ color: band.tone }}>
                  {band.label}
                </p>
                <p className="text-[11px] text-[var(--color-ink-3)]">{risk.score}/100</p>
              </div>
            </div>
          </div>

          <p className="mb-4 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">{band.line}</p>

          <ul className="stagger space-y-2.5">
            {risk.findings.map((finding) => (
              <li
                key={finding.key}
                className="flex flex-wrap items-start gap-3 rounded-[var(--radius-md)] border-l-[3px] px-3 py-2.5"
                style={{
                  borderLeftColor: SEVERITY_TONE[finding.severity],
                  background: `color-mix(in srgb, ${SEVERITY_TONE[finding.severity]} 7%, var(--color-surface-2))`,
                }}
              >
                <span
                  aria-hidden
                  className="mt-[6px] h-2 w-2 shrink-0 rounded-full"
                  style={{ background: SEVERITY_TONE[finding.severity] }}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] font-medium">{finding.title}</p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
                    {finding.detail}
                  </p>
                  {finding.severity !== "good" && (
                    <p className="mt-1.5 text-[11.5px] font-medium text-[var(--color-ink-2)]">
                      → {finding.action}
                    </p>
                  )}
                </div>
                <span
                  className="tabular shrink-0 text-[13px] font-semibold"
                  style={{ color: SEVERITY_TONE[finding.severity] }}
                >
                  {finding.metric}
                </span>
              </li>
            ))}
          </ul>
        </Card>

        {/* --------------------------------------------------- efficiency */}
        <Card>
          <CardTitle
            title="Efficiency — what the team turns into"
            hint={
              lever.headcount > 0
                ? `Per-head numbers read the ${lever.headcount} active salar${lever.headcount === 1 ? "y" : "ies"} on the Costs screen as the team.`
                : "Add the team's salaries on the Costs screen and the per-head numbers light up."
            }
          />
          <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile
              label="Revenue / employee"
              count={
                lever.revenuePerHead === null ? "—" : (
                  <Ticker value={lever.revenuePerHead} format="compact" currency={currency} />
                )
              }
              tone="var(--color-series-3)"
              hint={
                lever.headcount > 0
                  ? `${lever.headcount} on payroll · ${fmtCompact(lever.payroll, currency)} / month`
                  : "No active salaries recorded"
              }
            />
            <StatTile
              label="Profit / employee"
              count={
                lever.profitPerHead === null ? "—" : (
                  <Ticker value={lever.profitPerHead} format="compact" currency={currency} />
                )
              }
              tone={
                lever.profitPerHead !== null && lever.profitPerHead < 0
                  ? "var(--color-critical)"
                  : "var(--color-good)"
              }
              hint="Net profit spread across the team"
            />
            <StatTile
              label="Payroll share"
              count={lever.payrollSharePct === null ? "—" : <Ticker value={lever.payrollSharePct} digits={0} />}
              unit={lever.payrollSharePct === null ? undefined : "% of revenue"}
              tone={
                lever.payrollSharePct !== null && lever.payrollSharePct >= 50
                  ? "var(--color-warning)"
                  : "var(--color-series-2)"
              }
              hint={
                lever.deliverySharePct === null
                  ? "Salaries against monthly revenue"
                  : `Cost to serve is ${fmtPct(lever.deliverySharePct, 0)} of revenue`
              }
            />
            <StatTile
              label="Average client value"
              count={
                lever.avgClientValue === null ? "—" : (
                  <Ticker value={lever.avgClientValue} format="compact" currency={currency} />
                )
              }
              tone="var(--color-series-5)"
              hint={`Monthly revenue across ${head.activeClients} active client${head.activeClients === 1 ? "" : "s"}`}
            />
          </div>
        </Card>

        {/* --------------------------------------------- media buyer load */}
        {buyerLoad && (buyerLoad.buyers.length > 0 || buyerLoad.unassigned.clients > 0) && (
          <Card>
            <CardTitle
              title="Media buyer load"
              hint="Active retainers per buyer against the capacity set on Settings. The verdict below is the hiring question, answered from the numbers."
            />
            {buyerLoad.buyers.map((buyer) => (
              <BarRow
                key={buyer.id}
                label={`${buyer.name} · ${buyer.clients}/${buyer.capacity} client${buyer.capacity === 1 ? "" : "s"}`}
                value={buyer.clients}
                total={Math.max(buyer.capacity, buyer.clients)}
                tone={
                  buyer.clients > buyer.capacity
                    ? "var(--color-critical)"
                    : buyer.clients === buyer.capacity
                      ? "var(--color-warning)"
                      : "var(--color-series-1)"
                }
                right={fmtCompact(buyer.mrr, currency)}
              />
            ))}
            {buyerLoad.unassigned.clients > 0 && (
              <BarRow
                label={`Unassigned · ${buyerLoad.unassigned.clients} client${buyerLoad.unassigned.clients === 1 ? "" : "s"}`}
                value={buyerLoad.unassigned.clients}
                total={Math.max(1, buyerLoad.totalRetainers)}
                tone="var(--color-warning)"
                right={fmtCompact(buyerLoad.unassigned.mrr, currency)}
              />
            )}
            <p className="mt-3 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
              {buyerLoad.totalCapacity === 0
                ? `${buyerLoad.totalRetainers} retainer${buyerLoad.totalRetainers === 1 ? "" : "s"} and no bench recorded — add your media buyers on Settings and assign each account.`
                : buyerLoad.headroom < 0
                  ? `The bench is ${Math.abs(buyerLoad.headroom)} client${Math.abs(buyerLoad.headroom) === 1 ? "" : "s"} over capacity (${buyerLoad.totalRetainers} retainers on ${buyerLoad.totalCapacity} seats). Time to hire — or raise a capacity if someone genuinely carries more.`
                  : buyerLoad.headroom <= 1
                    ? `At capacity: ${buyerLoad.totalRetainers} retainers on ${buyerLoad.totalCapacity} seats. The next signing needs a new buyer lined up.`
                    : `Headroom for ${buyerLoad.headroom} more client${buyerLoad.headroom === 1 ? "" : "s"} (${buyerLoad.totalRetainers} retainers on ${buyerLoad.totalCapacity} seats) — sell before you hire.`}
            </p>
          </Card>
        )}

        {/* --------------------------------------------------- revenue mix */}
        <Card>
          <CardTitle
            title="Revenue mix — performance vs creative"
            hint="Performance is the retainer book and renews by itself; creative lands once, in the month a project kicks off, and has to be re-sold. The mix says how much of next month is already won."
          />
          <BarRow
            label={`Performance retainers · ${head.retainerClients} client${head.retainerClients === 1 ? "" : "s"}`}
            value={head.performance}
            total={head.revenue}
            tone="var(--color-series-1)"
            right={`${fmtMoney(head.performance, currency)} / mo`}
          />
          <BarRow
            label={`Creative one-offs landing this month · ${head.projectClients} active project${head.projectClients === 1 ? "" : "s"}`}
            value={head.creative}
            total={head.revenue}
            tone="var(--color-series-4)"
            right={fmtMoney(head.creative, currency)}
          />
        </Card>

        {/* ----------------------------------------------- revenue by service */}
        {services.length > 0 && (
          <Card>
            <CardTitle
              title="Revenue by service — this month"
              hint="Where the month's contracted revenue actually comes from. A client's revenue splits evenly across the services tagged on their card, so keep the tags honest. Blue is the performance book, orange is creative landing this month."
            />
            {services.map((row) => (
              <BarRow
                key={row.service}
                label={`${row.service} · ${row.clients} client${row.clients === 1 ? "" : "s"}`}
                value={row.total}
                total={head.revenue}
                tone={row.performance >= row.creative ? "var(--color-series-1)" : "var(--color-series-4)"}
                right={fmtMoney(row.total, currency)}
              />
            ))}
            <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              {services
                .slice(0, 3)
                .map(
                  (row) =>
                    `${row.service}: ${fmtCompact(row.performance, currency)} performance · ${fmtCompact(row.creative, currency)} creative`,
                )
                .join("  ·  ")}
            </p>
          </Card>
        )}

        {/* ---------------------------------------------------- projection */}
        <Card>
          <CardTitle
            title="Next six months, on today's contracts"
            hint="No growth assumed and no renewals invented — a retainer earns until its end date, a project lands once in its kickoff month, exactly as it will be invoiced. The cliff shows up before it arrives."
          />
          <ProfitBars
            points={forecast.map((month) => ({
              label: month.label.split(" ")[0],
              value: month.profit,
              hint: `${month.label}: ${fmtMoney(month.revenue, currency)} in, ${fmtMoney(
                month.costs,
                currency,
              )} out`,
            }))}
          />
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr>
                  <Th>Month</Th>
                  <Th align="right">Performance</Th>
                  <Th align="right">Creative</Th>
                  <Th align="right">Revenue</Th>
                  <Th align="right">Costs</Th>
                  <Th align="right">Profit</Th>
                  <Th align="right">Confidence</Th>
                </tr>
              </thead>
              <tbody>
                {forecast.map((month) => (
                  <tr key={month.month}>
                    <Td>{month.label}</Td>
                    <Td align="right">
                      <span className="tabular text-[var(--color-ink-2)]">
                        {fmtMoney(month.performance, currency)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-[var(--color-ink-2)]">
                        {month.creative > 0 ? fmtMoney(month.creative, currency) : "—"}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="tabular">{fmtMoney(month.revenue, currency)}</span>
                    </Td>
                    <Td align="right">
                      <span className="tabular text-[var(--color-ink-2)]">
                        {fmtMoney(month.costs, currency)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span
                        className="tabular font-medium"
                        style={{
                          color: month.profit < 0 ? "var(--color-critical)" : "var(--color-good)",
                        }}
                      >
                        {fmtMoney(month.profit, currency)}
                      </span>
                    </Td>
                    <Td align="right">
                      <Chip
                        tone={
                          month.confidence === "booked"
                            ? "var(--color-good)"
                            : month.confidence === "likely"
                              ? "var(--color-series-1)"
                              : "var(--color-ink-3)"
                        }
                      >
                        {month.confidence}
                      </Chip>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ------------------------------------------------------ margins */}
        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="Margin by client"
              hint="Each line of business on its own subtotal and in its own units: a retainer's monthly fee against its monthly cost to serve; a project's whole contract against its whole delivery cost across the months it runs."
            />
          </div>
          <TableWrap>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th align="right">Revenue</Th>
                <Th align="right">Cost to serve</Th>
                <Th align="right">Gross profit</Th>
                <Th align="right">Margin</Th>
                <Th align="right">Share of revenue</Th>
                <Th>Health</Th>
              </tr>
            </thead>
            {books.map((book) => (
            <tbody key={book.key}>
              <tr>
                <td
                  colSpan={7}
                  className="border-b border-[var(--color-line)] px-3 pb-1.5 pt-3.5 text-[11px] font-bold uppercase tracking-[0.08em]"
                  style={{ color: book.tone }}
                >
                  {book.label}
                  <span className="ml-2 font-medium normal-case tracking-normal text-[var(--color-ink-3)]">
                    {book.hint}
                  </span>
                </td>
              </tr>
              {book.clients.map((client) => (
                <tr key={client.id} className="transition-colors hover:bg-[var(--color-surface-2)]">
                  <Td>
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="min-w-0 truncate font-medium">{client.name}</span>
                      {client.vip && (
                        <span
                          title="VIP account"
                          className="shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-semibold"
                          style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
                        >
                          VIP
                        </span>
                      )}
                    </div>
                  </Td>
                  <Td align="right">
                    <span className="tabular">{fmtMoney(client.bookValue, currency)}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular text-[var(--color-ink-2)]">
                      {fmtMoney(client.deliveryCost, currency)}
                    </span>
                  </Td>
                  <Td align="right">
                    <span className="tabular">{fmtMoney(client.grossProfit, currency)}</span>
                  </Td>
                  <Td align="right">
                    {client.marginPct === null ? (
                      <span className="text-[var(--color-ink-3)]">—</span>
                    ) : (
                      <span
                        className="tabular font-medium"
                        style={{
                          color:
                            client.marginPct < 20
                              ? "var(--color-critical)"
                              : client.marginPct < 40
                                ? "var(--color-warning)"
                                : "var(--color-good)",
                        }}
                      >
                        {fmtPct(client.marginPct, 0)}
                      </span>
                    )}
                  </Td>
                  <Td align="right">
                    <span className="tabular text-[var(--color-ink-2)]">
                      {fmtPct(client.shareOfRevenuePct, 0)}
                    </span>
                  </Td>
                  <Td>
                    <Chip tone={HEALTH[client.health].tone} title={HEALTH[client.health].hint}>
                      {HEALTH[client.health].label}
                    </Chip>
                  </Td>
                </tr>
              ))}
              <tr className="bg-[var(--color-surface-2)]">
                <Td>
                  <span className="text-[12px] font-semibold text-[var(--color-ink-2)]">
                    {book.label} — {book.clients.length} client{book.clients.length === 1 ? "" : "s"}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular font-semibold">{fmtMoney(book.value, currency)}</span>
                </Td>
                <Td align="right">
                  <span className="tabular font-semibold text-[var(--color-ink-2)]">
                    {fmtMoney(book.deliveryCost, currency)}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular font-semibold">
                    {fmtMoney(book.value - book.deliveryCost, currency)}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular font-semibold">
                    {book.value > 0 ? fmtPct(((book.value - book.deliveryCost) / book.value) * 100, 0) : "—"}
                  </span>
                </Td>
                <Td align="right">
                  <span className="tabular font-semibold text-[var(--color-ink-2)]" />
                </Td>
                <Td />
              </tr>
            </tbody>
            ))}
          </TableWrap>
        </Card>

        {/* ------------------------------------------------------ cost mix */}
        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle title="Cost mix" hint="What the monthly base is actually made of." />
            {totals
              .filter((row) => row.total > 0)
              .sort((a, b) => b.total - a.total)
              .map((row) => (
                <BarRow
                  key={row.category}
                  label={CATEGORY_LABEL[row.category]}
                  value={row.total}
                  total={burn}
                  tone={CATEGORY_TONE[row.category]}
                  right={fmtMoney(row.total, currency)}
                />
              ))}
          </Card>

          <Card>
            <CardTitle
              title="Revenue concentration — this month"
              hint="How much of the month walks out the door with one phone call."
            />
            {economics
              .filter((client) => client.monthRevenue > 0)
              .map((client) => (
                <BarRow
                  key={client.id}
                  label={client.name}
                  value={client.monthRevenue}
                  total={head.revenue}
                  tone={
                    client.shareOfRevenuePct >= 35
                      ? "var(--color-critical)"
                      : client.shareOfRevenuePct >= 25
                        ? "var(--color-warning)"
                        : "var(--color-series-1)"
                  }
                  right={fmtMoney(client.monthRevenue, currency)}
                />
              ))}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
