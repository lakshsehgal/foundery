"use client";

import { useMemo, useState } from "react";
import { Crown, Plus, Search, Users } from "lucide-react";
import { Button, Select, TextInput } from "@/components/ui/form";
import { avatarTint, Chip, EmptyState, Redacted } from "@/components/ui/primitives";
import { CLIENT_STATUS, ENGAGEMENT, HEALTH, type ClientStatus } from "@/lib/taxonomy";
import type { ClientView } from "@/lib/queries";
import { ClientEditor } from "./client-editor";

export type ClientMoney = {
  monthly: string;
  /** Set only for one-off projects: the whole contract, not the monthly slice. */
  total: string | null;
  margin: number | null;
};

const GROUPS: { status: ClientStatus; hint: string }[] = [
  { status: "active", hint: "Being delivered right now" },
  { status: "paused", hint: "On hold — keep them warm" },
  { status: "churned", hint: "Gone, kept for the record" },
];

function marginTone(margin: number): string {
  if (margin < 20) return "var(--color-critical)";
  if (margin < 40) return "var(--color-warning)";
  return "var(--color-good)";
}

/**
 * The board. Each client is a card that owns a colour, grouped by status the
 * way monday groups rows — the book of business readable at a glance, not a
 * spreadsheet to be scanned.
 */
export function ClientsView({
  clients, canEditValues, currencySymbol, money,
}: {
  clients: ClientView[];
  canEditValues: boolean;
  currencySymbol: string;
  /** Worked out and formatted on the server. Absent = not cleared to see it. */
  money: Record<number, ClientMoney>;
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("working");
  const [editing, setEditing] = useState<ClientView | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (statusFilter === "working" && client.status === "churned") return false;
      if (statusFilter !== "working" && statusFilter !== "all" && client.status !== statusFilter)
        return false;
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        (client.owner ?? "").toLowerCase().includes(needle) ||
        client.services.some((service) => service.toLowerCase().includes(needle))
      );
    });
  }, [clients, query, statusFilter]);

  function edit(client: ClientView | null) {
    setEditing(client);
    setOpen(true);
  }

  const groups = GROUPS.map((group) => ({
    ...group,
    clients: filtered.filter((client) => client.status === group.status),
  })).filter((group) => group.clients.length > 0);

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
          />
          <TextInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, owner or service"
            aria-label="Search clients"
            className="pl-8"
          />
        </div>
        <div className="w-[150px] shrink-0">
          <Select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="working">In play</option>
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="churned">Churned</option>
            <option value="all">Everyone</option>
          </Select>
        </div>
        <Button variant="primary" onClick={() => edit(null)} className="shrink-0">
          <Plus size={14} />
          Add client
        </Button>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
          <EmptyState
            icon={<Users size={22} />}
            title={clients.length === 0 ? "No clients yet" : "Nothing matches that"}
            hint={
              clients.length === 0
                ? "Add the accounts you're running. Invoices, reminders and the founder numbers all read from this board."
                : "Try a different search, or widen the filter."
            }
            action={
              clients.length === 0 ? (
                <Button variant="primary" onClick={() => edit(null)}>
                  <Plus size={14} />
                  Add your first client
                </Button>
              ) : undefined
            }
          />
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.status}>
            <div className="mb-2.5 flex items-baseline gap-2.5">
              <h2
                className="text-[13.5px] font-bold"
                style={{ color: CLIENT_STATUS[group.status].tone }}
              >
                {CLIENT_STATUS[group.status].label}
              </h2>
              <span className="tabular text-[12px] font-semibold text-[var(--color-ink-3)]">
                {group.clients.length}
              </span>
              <span className="text-[11.5px] text-[var(--color-ink-3)]">{group.hint}</span>
            </div>

            <div className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {group.clients.map((client) => {
                const clientTone = avatarTint(String(client.id));
                const figures = money[client.id];
                return (
                  <button
                    key={client.id}
                    onClick={() => edit(client)}
                    className="lift group overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-left"
                  >
                    {/* The client's colour, everywhere they appear. */}
                    <div aria-hidden className="h-1.5 w-full" style={{ background: clientTone }} />

                    <div className="p-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-[15px] font-bold tracking-tight">
                          {client.name}
                        </span>
                        {client.vip && (
                          <span
                            title="VIP account"
                            className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                            style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
                          >
                            <Crown size={10} aria-hidden />
                            VIP
                          </span>
                        )}
                        {client.health && (
                          <span
                            aria-label={HEALTH[client.health].label}
                            title={`${HEALTH[client.health].label} — ${HEALTH[client.health].hint}`}
                            className="ml-auto h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ background: HEALTH[client.health].tone }}
                          />
                        )}
                      </div>

                      <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-3)]">
                        {ENGAGEMENT[client.engagement].short}
                        {client.owner ? ` · ${client.owner}` : ""} · bills day {client.billing_day} ·
                        net {client.terms_days}
                      </p>

                      <div className="mt-3 flex min-h-[22px] flex-wrap gap-1">
                        {client.services.slice(0, 3).map((service) => (
                          <Chip key={service} tone={clientTone}>
                            {service}
                          </Chip>
                        ))}
                        {client.services.length > 3 && (
                          <Chip tone="var(--color-ink-3)" title={client.services.slice(3).join(", ")}>
                            +{client.services.length - 3}
                          </Chip>
                        )}
                      </div>

                      <div className="mt-3.5 flex items-end justify-between gap-2 border-t border-[var(--color-line)] pt-3">
                        {figures ? (
                          <>
                            <div className="min-w-0">
                              <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                                {client.engagement === "retainer" ? "Retainer / mo" : "Per month"}
                              </p>
                              <p className="tabular truncate text-[17px] font-bold tracking-tight">
                                {figures.monthly}
                              </p>
                              {figures.total && (
                                <p className="tabular text-[10.5px] text-[var(--color-ink-3)]">
                                  {figures.total} total
                                </p>
                              )}
                            </div>
                            {figures.margin !== null && (
                              <div className="shrink-0 text-right">
                                <p className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                                  Margin
                                </p>
                                <p
                                  className="tabular text-[17px] font-bold tracking-tight"
                                  style={{ color: marginTone(figures.margin) }}
                                >
                                  {figures.margin.toFixed(0)}%
                                </p>
                              </div>
                            )}
                          </>
                        ) : (
                          <Redacted />
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        ))
      )}

      <ClientEditor
        key={editing?.id ?? "new"}
        open={open}
        onClose={() => setOpen(false)}
        client={editing}
        canEditValues={canEditValues}
        currencySymbol={currencySymbol}
      />
    </>
  );
}
