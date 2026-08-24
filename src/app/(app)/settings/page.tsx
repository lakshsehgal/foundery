import type { Metadata } from "next";
import { requireFounder } from "@/lib/auth";
import { getDb, getSetting } from "@/lib/db";
import { OPERATOR_SWITCHES, readOperatorSwitches } from "@/lib/policy";
import { defaultCurrency, symbolFor } from "@/lib/money";
import { Card, CardTitle, PageBody, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { BusinessForm, VisibilityForm } from "./settings-forms";
import { ZohoConnectCard } from "./zoho-connect";
import { ZohoMatchCard, type MatchCustomer } from "./zoho-match";
import { customersFromInvoices, fetchZohoInvoices, getZohoConfig } from "@/lib/zoho";
import { clientOptions, listClients } from "@/lib/queries";
import { fmtCompact } from "@/lib/money";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

/**
 * Server side of the matcher: pull the invoices from Zoho (the token can't
 * list contacts, but every invoice names its customer), aggregate them, and
 * pair with the current client → zoho_name mappings.
 */
async function ZohoMatcher() {
  const [clients, fullClients] = await Promise.all([clientOptions(), listClients("founder")]);
  const mappingByZohoName = new Map(
    fullClients
      .filter((client) => client.zoho_name)
      .map((client) => [client.zoho_name!.trim().toLowerCase(), client.id]),
  );

  let customers: MatchCustomer[] = [];
  let fetchError: string | null = null;
  try {
    const config = (await getZohoConfig())!;
    customers = customersFromInvoices(await fetchZohoInvoices(config)).map((customer) => ({
      name: customer.name,
      invoiceCount: customer.invoiceCount,
      outstandingLabel: fmtCompact(customer.outstanding),
      hasOutstanding: customer.outstanding > 0,
      mappedClientId: mappingByZohoName.get(customer.name.trim().toLowerCase()) ?? null,
    }));
  } catch (error) {
    fetchError = error instanceof Error ? error.message : "Couldn't reach Zoho.";
  }

  return (
    <ZohoMatchCard
      customers={customers}
      clients={clients.map((client) => ({ id: client.id, name: client.name }))}
      fetchError={fetchError}
    />
  );
}

export default async function SettingsPage() {
  await requireFounder();

  const currency = defaultCurrency();
  const db = await getDb();

  const [storedSwitches, audit, businessName, cashBuffer, zohoConfig] = await Promise.all([
    readOperatorSwitches(),
    db.query<{
      ts: string; actor: string; action: string; entity: string | null; detail: string | null;
    }>(
      `SELECT ts, actor, action, entity, detail FROM foundery.audit_log
       ORDER BY ts DESC, id DESC LIMIT 25`,
    ),
    getSetting("business_name", "Neuroid Media"),
    getSetting("cash_buffer", ""),
    getZohoConfig(),
  ]);

  const stored = new Map(storedSwitches.map((row) => [row.key, row.value]));
  const switches = OPERATOR_SWITCHES.map((definition) => ({
    key: definition.key as string,
    label: definition.label as string,
    hint: definition.hint as string,
    value: stored.get(definition.key) ?? definition.fallback === "1",
  }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Visibility, the business, and who did what" />
      <PageBody>
        <VisibilityForm switches={switches} currencySymbol={symbolFor(currency)} />

        <BusinessForm
          businessName={businessName}
          cashBuffer={cashBuffer}
          currencySymbol={symbolFor(currency)}
        />

        <ZohoConnectCard connected={zohoConfig !== null} />

        {zohoConfig && <ZohoMatcher />}

        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="Recent activity"
              hint="Every write, and which passcode made it. Handy when a number changes and nobody remembers why."
            />
          </div>
          {audit.length === 0 ? (
            <p className="px-4 py-8 text-center text-[13px] text-[var(--color-ink-3)]">
              Nothing recorded yet.
            </p>
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th>When</Th>
                  <Th>Who</Th>
                  <Th>What</Th>
                  <Th>Detail</Th>
                </tr>
              </thead>
              <tbody>
                {audit.map((row, index) => (
                  <tr key={`${row.ts}-${index}`}>
                    <Td>
                      <span className="tabular text-[12px] text-[var(--color-ink-2)]">{row.ts}</span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] capitalize">{row.actor}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-[11.5px] text-[var(--color-ink-2)]">
                        {row.action}
                      </span>
                    </Td>
                    <Td>
                      <span className="truncate text-[12.5px] text-[var(--color-ink-3)]">
                        {row.detail ?? row.entity ?? "—"}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          )}
        </Card>

        <Card>
          <CardTitle title="Who can sign in" hint="Configured in the environment, not the database." />
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            Sign-in is passwordless — Google, or a code emailed to you. Who gets in is two lists of
            emails in the deployment&apos;s environment variables:{" "}
            <code className="rounded-[var(--radius-xs)] bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[11.5px]">
              FOUNDERY_FOUNDER_EMAILS
            </code>{" "}
            and{" "}
            <code className="rounded-[var(--radius-xs)] bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[11.5px]">
              FOUNDERY_OPERATOR_EMAILS
            </code>{" "}
            (comma-separated). An email on neither list is turned away by name. Keeping the lists
            outside the app means nobody can grant themselves access from inside it.
          </p>
        </Card>

        <Card>
          <CardTitle
            title="Our access IDs for client onboarding"
            hint="Shown to clients inside the onboarding checklist, so they grant access to the right accounts. Leave blank to show generic instructions."
          />
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            Business Manager ID, Shopify collaborator code, Google MCC ID and the Google emails to
            invite are read from settings keys{" "}
            <code className="rounded-[var(--radius-xs)] bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[11.5px]">
              neuroid_meta_bm_id · neuroid_shopify_collab · neuroid_google_mcc · neuroid_gmc_email ·
              neuroid_ga_email
            </code>
            . Ask Claude to set them, or insert them into the settings table directly.
          </p>
        </Card>
      </PageBody>
    </>
  );
}
