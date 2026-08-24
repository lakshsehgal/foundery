import Link from "next/link";
import type { Metadata } from "next";
import { AlertTriangle, CalendarClock, CheckCircle2, FilePlus2, Inbox } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { policyFor } from "@/lib/policy";
import { listClients, listSubmissions, reminders, costTotals, monthlyBurn } from "@/lib/queries";
import { fmtCompact, fmtMoney } from "@/lib/money";
import { prettyDate, todayISO } from "@/lib/dates";
import {
  Card, CardTitle, EmptyState, PageBody, PageHeader, Pill, Redacted, StatTile,
} from "@/components/ui/primitives";

export const metadata: Metadata = { title: "Today" };
export const dynamic = "force-dynamic";

const KIND_STYLE = {
  overdue: { tone: "var(--color-critical)", label: "Overdue", icon: AlertTriangle },
  due_soon: { tone: "var(--color-warning)", label: "Due soon", icon: CalendarClock },
  to_raise: { tone: "var(--color-series-1)", label: "To raise", icon: FilePlus2 },
} as const;

export default async function TodayPage() {
  const role = await requireRole();
  const today = todayISO();

  const [policy, feed, clients, burn, totals, submissions] = await Promise.all([
    policyFor(role),
    reminders(role, today),
    listClients(role),
    monthlyBurn(),
    costTotals(),
    listSubmissions(),
  ]);

  const active = clients.filter((c) => c.status === "active");
  const recentSubmissions = submissions.slice(0, 4);
  const overdueCount = feed.filter((r) => r.kind === "overdue").length;

  return (
    <>
      <PageHeader
        title="Today"
        subtitle={new Date(today).toLocaleDateString("en-GB", {
          weekday: "long", day: "numeric", month: "long", year: "numeric",
        })}
      >
        <Link
          href="/invoices"
          className="inline-flex items-center gap-1.5 rounded-[var(--radius-md)] bg-[var(--color-brand)] px-3.5 py-2 text-[13px] font-semibold text-[var(--color-brand-ink)] shadow-[0_1px_2px_rgb(16_24_40/0.10)] transition-colors hover:bg-[var(--color-brand-hover)]"
        >
          Invoices
        </Link>
      </PageHeader>

      <PageBody>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Active clients"
            value={active.length}
            hint={`${active.filter((c) => c.vip).length} VIP · ${
              active.filter((c) => c.engagement === "retainer").length
            } on retainer`}
          />
          <StatTile
            label="Monthly cost base"
            value={fmtCompact(burn)}
            hint={`Across ${totals.filter((c) => c.count > 0).length} categories`}
          />
          <StatTile
            label="Needs chasing"
            value={overdueCount}
            accent={overdueCount > 0 ? "var(--color-critical)" : undefined}
            hint={overdueCount > 0 ? "Invoices past their due date" : "Nothing is past due"}
          />
          <StatTile
            label="On the list"
            value={feed.length}
            hint={feed.length === 0 ? "Clear" : "Things wanting attention this week"}
          />
        </div>

        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title="What needs you"
              hint="Invoices past due, invoices about to be due, and retainers that still haven't been billed this month."
            />
          </div>

          {feed.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={22} />}
              title="Nothing is waiting"
              hint="Every invoice is either paid or inside its terms, and this month's retainers have all been raised."
            />
          ) : (
            <ul className="divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {feed.map((item, index) => {
                const style = KIND_STYLE[item.kind];
                const Icon = style.icon;
                return (
                  <li key={`${item.kind}-${item.invoiceId ?? item.clientId}-${index}`}>
                    <Link
                      href="/invoices"
                      className="flex items-start gap-3 px-4 py-3 transition-colors hover:bg-[var(--color-surface-2)]"
                    >
                      <span
                        aria-hidden
                        className="mt-[3px] grid h-6 w-6 shrink-0 place-items-center rounded-full"
                        style={{ background: `color-mix(in srgb, ${style.tone} 16%, transparent)`, color: style.tone }}
                      >
                        <Icon size={13} />
                      </span>

                      <div className="min-w-0 flex-1">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] font-medium">
                          <span className="min-w-0">{item.title}</span>
                          {item.vip && (
                            <Pill fill="var(--color-brand)" title="VIP client">
                              <span style={{ color: "var(--color-brand-ink)" }}>VIP</span>
                            </Pill>
                          )}
                        </p>
                        <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-3)]">
                          {item.clientName} · {item.detail}
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <p className="tabular text-[13px] font-semibold">
                          {policy.invoiceAmounts && item.amount !== null ? (
                            fmtMoney(item.amount)
                          ) : (
                            <Redacted />
                          )}
                        </p>
                        <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
                          {item.kind === "to_raise" ? "would fall due " : "due "}
                          {prettyDate(item.dueDate)}
                        </p>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardTitle title="Newest clients" hint="Most recently added to the book." />
            {clients.length === 0 ? (
              <EmptyState
                title="No clients yet"
                hint="Add the accounts you're running and everything else on this page starts working."
                action={
                  <Link href="/clients" className="text-[13px] font-medium underline underline-offset-4">
                    Add a client
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2">
                {clients.slice(0, 5).map((client) => (
                  <li key={client.id} className="flex items-center gap-2.5">
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{
                        background:
                          client.status === "active" ? "var(--color-good)" : "var(--color-ink-3)",
                      }}
                    />
                    <span className="min-w-0 flex-1 truncate text-[13px]">{client.name}</span>
                    {client.vip && (
                      <span
                        className="shrink-0 rounded-[var(--radius-xs)] px-1.5 py-0.5 text-[10.5px] font-semibold"
                        style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
                      >
                        VIP
                      </span>
                    )}
                    <span className="shrink-0 text-[11.5px] text-[var(--color-ink-3)]">
                      {client.engagement === "retainer" ? "Retainer" : "Project"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card>
            <CardTitle title="Onboarding replies" hint="Forms clients have filled in." />
            {recentSubmissions.length === 0 ? (
              <EmptyState
                icon={<Inbox size={20} />}
                title="No replies yet"
                hint="Make an onboarding form, send the link, and answers land here."
                action={
                  <Link href="/onboarding" className="text-[13px] font-medium underline underline-offset-4">
                    Set one up
                  </Link>
                }
              />
            ) : (
              <ul className="space-y-2.5">
                {recentSubmissions.map((submission) => (
                  <li key={submission.id}>
                    <Link
                      href={`/onboarding/${submission.form_id}`}
                      className="block min-w-0 hover:underline"
                    >
                      <p className="truncate text-[13px] font-medium">
                        {submission.answers.brand ||
                          submission.client_name ||
                          submission.form_title}
                      </p>
                      <p className="truncate text-[11.5px] text-[var(--color-ink-3)]">
                        {submission.form_title} · {prettyDate(submission.submitted_at.slice(0, 10))}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </PageBody>
    </>
  );
}
