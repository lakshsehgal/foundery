import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { policyFor } from "@/lib/policy";
import { clientOptions, costTotals, listCosts, monthlyBurn } from "@/lib/queries";
import { defaultCurrency, fmtCompact, fmtMoney, symbolFor } from "@/lib/money";
import { CADENCES, CATEGORY_LABEL } from "@/lib/taxonomy";
import { PageBody, PageHeader, PolicyNote, StatTile } from "@/components/ui/primitives";
import { CostsView, type CostRowDisplay } from "./costs-view";

export const metadata: Metadata = { title: "Costs" };
export const dynamic = "force-dynamic";

const CADENCE_LABEL: Record<string, string> = Object.fromEntries(
  CADENCES.map((cadence) => [cadence.key, cadence.label]),
);

export default async function CostsPage() {
  const role = await requireRole();
  const policy = policyFor(role);
  const currency = defaultCurrency();

  const costs = listCosts(role);
  const burn = monthlyBurn();
  const totals = costTotals();

  const rows: CostRowDisplay[] = costs.map((cost) => ({
    ...cost,
    amountLabel: cost.amount === null ? "—" : fmtMoney(cost.amount, currency),
    monthlyLabel: cost.monthly === null ? "—" : fmtMoney(cost.monthly, currency),
    cadenceLabel: cost.aggregated ? "Every month" : (CADENCE_LABEL[cost.cadence] ?? cost.cadence),
  }));

  const totalsDisplay = totals.map((total) => ({
    ...total,
    label: fmtMoney(total.total, currency),
  }));

  const salaries = totals.find((total) => total.category === "salary");
  const biggest = [...totals].sort((a, b) => b.total - a.total)[0];

  return (
    <>
      <PageHeader title="Costs" subtitle={`${fmtMoney(burn, currency)} a month`} />
      <PageBody width={1060}>
        <div className="grid gap-3 sm:grid-cols-3">
          <StatTile label="Monthly cost base" value={fmtCompact(burn, currency)} hint="Everything, at its monthly rate" />
          <StatTile
            label="People"
            value={salaries ? fmtCompact(salaries.total, currency) : "—"}
            hint={`${salaries?.count ?? 0} on payroll`}
            swatch="var(--color-series-1)"
          />
          <StatTile
            label="Biggest slice"
            value={biggest && burn > 0 ? `${((biggest.total / burn) * 100).toFixed(0)}%` : "—"}
            hint={biggest ? `${CATEGORY_LABEL[biggest.category]} lead the spend` : ""}
          />
        </div>

        {!policy.costLineItems("salary") && (
          <PolicyNote>
            You can see what the team costs the business in total — that&apos;s the number you need to
            price work. What each person earns individually stays with the founder.
          </PolicyNote>
        )}

        <CostsView
          rows={rows}
          totals={totalsDisplay}
          burnLabel={fmtMoney(burn, currency)}
          canEdit={role === "founder"}
          currencySymbol={symbolFor(currency)}
          clients={clientOptions().map((client) => ({ id: client.id, name: client.name }))}
        />
      </PageBody>
    </>
  );
}
