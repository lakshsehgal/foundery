import type { Metadata } from "next";
import { requireRole } from "@/lib/auth";
import { policyFor } from "@/lib/policy";
import { listClients } from "@/lib/queries";
import { defaultCurrency, fmtMoney, symbolFor } from "@/lib/money";
import { marginPct, monthlyRevenue } from "@/lib/economics";
import { PageBody, PageHeader, PolicyNote } from "@/components/ui/primitives";
import { ClientsView } from "./clients-view";

export const metadata: Metadata = { title: "Clients" };
export const dynamic = "force-dynamic";

export default async function ClientsPage() {
  const role = await requireRole();
  const policy = policyFor(role);
  const clients = listClients(role);
  const currency = defaultCurrency();

  // Money is formatted and margins are worked out here, on the server: the
  // currency rules stay in one place, and a redacted figure is never handed to
  // the browser just so the browser can decide not to draw it.
  const money: Record<number, { monthly: string; total: string | null; margin: number | null }> = {};
  for (const client of clients) {
    if (client.retainer_amount === null || client.one_time_value === null) continue;
    const monthly = monthlyRevenue({
      engagement: client.engagement,
      retainer_amount: client.retainer_amount,
      one_time_value: client.one_time_value,
      start_date: client.start_date,
      end_date: client.end_date,
    });
    money[client.id] = {
      monthly: fmtMoney(monthly, currency),
      // A project's headline number is its total; the monthly figure above is
      // how it sits next to a retainer, so both are shown rather than one
      // silently standing in for the other.
      total: client.engagement === "one_time" ? fmtMoney(client.one_time_value, currency) : null,
      margin: marginPct(monthly, client.delivery_cost ?? 0),
    };
  }

  const active = clients.filter((c) => c.status === "active").length;

  return (
    <>
      <PageHeader
        title="Clients"
        subtitle={`${active} active · ${clients.filter((c) => c.vip).length} VIP`}
      />
      <PageBody width={1120}>
        {!policy.clientValues && (
          <PolicyNote>
            Retainer sizes, project values and account health are the founder&apos;s view. Everything
            you need to run the accounts — who they are, what we deliver, who&apos;s VIP, and when
            they bill — is here.
          </PolicyNote>
        )}
        <ClientsView
          clients={clients}
          canEditValues={policy.clientValues}
          currencySymbol={symbolFor(currency)}
          money={money}
        />
      </PageBody>
    </>
  );
}
