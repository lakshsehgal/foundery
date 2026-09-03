import type { Metadata } from "next";
import { requireFounder } from "@/lib/auth";
import { getDb, getSetting } from "@/lib/db";
import { OPERATOR_SWITCHES, readOperatorSwitches } from "@/lib/policy";
import { defaultCurrency, symbolFor } from "@/lib/money";
import { Card, CardTitle, PageBody, PageHeader, TableWrap, Td, Th } from "@/components/ui/primitives";
import { BusinessForm, VisibilityForm } from "./settings-forms";
import { TeamCard } from "./team-card";
import { ResendCard } from "./resend-card";
import { MediaBuyersCard } from "./media-buyers-card";
import { listTeam } from "@/app/actions/team";
import { listMediaBuyers } from "@/app/actions/media-buyers";
import { getResendConfig } from "@/lib/resend";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  await requireFounder();

  const currency = defaultCurrency();
  const db = await getDb();

  const [storedSwitches, audit, businessName, cashBuffer, team, resendConfig, buyers] =
    await Promise.all([
    readOperatorSwitches(),
    db.query<{
      ts: string; actor: string; action: string; entity: string | null; detail: string | null;
    }>(
      `SELECT ts, actor, action, entity, detail FROM foundery.audit_log
       ORDER BY ts DESC, id DESC LIMIT 25`,
    ),
    getSetting("business_name", "Neuroid Media"),
    getSetting("cash_buffer", ""),
    listTeam(),
    getResendConfig(),
    listMediaBuyers(),
  ]);

  const bootstrapFounder = (process.env.FOUNDERY_FOUNDER_EMAILS || "laksh@neuroidmedia.com")
    .split(/[,\s]+/)[0];

  const stored = new Map(storedSwitches.map((row) => [row.key, row.value]));
  const switches = OPERATOR_SWITCHES.map((definition) => ({
    key: definition.key as string,
    label: definition.label as string,
    hint: definition.hint as string,
    value: stored.get(definition.key) ?? (definition.fallback as string) === "1",
  }));

  return (
    <>
      <PageHeader title="Settings" subtitle="Visibility, the business, and who did what" />
      <PageBody>
        <TeamCard members={team} bootstrapFounder={bootstrapFounder} />

        <MediaBuyersCard buyers={buyers} />

        <ResendCard connected={resendConfig !== null} founderEmail={bootstrapFounder} />

        <VisibilityForm switches={switches} currencySymbol={symbolFor(currency)} />

        <BusinessForm
          businessName={businessName}
          cashBuffer={cashBuffer}
          currencySymbol={symbolFor(currency)}
        />

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
          <CardTitle
            title="Our access IDs for client onboarding"
            hint="Shown to clients inside the onboarding checklist, so they grant access to the right accounts. Leave blank to show generic instructions."
          />
          <p className="text-[12.5px] leading-relaxed text-[var(--color-ink-2)]">
            The Meta Business Manager ID and the Google admin email are read from settings keys{" "}
            <code className="rounded-[var(--radius-xs)] bg-[var(--color-surface-3)] px-1 py-0.5 font-mono text-[11.5px]">
              neuroid_meta_bm_id · neuroid_google_admin
            </code>
            . When unset, the checklist uses Neuroid&apos;s defaults — BM 1100898224148253 and
            admin@neuroidmedia.com.
          </p>
        </Card>
      </PageBody>
    </>
  );
}
