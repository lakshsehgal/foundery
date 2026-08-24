"use client";

import { useMemo, useState } from "react";
import { Pencil, Plus, Search, Users } from "lucide-react";
import { Button, Select, TextInput } from "@/components/ui/form";
import {
  Card, Chip, EmptyState, Redacted, TableWrap, Td, Th,
} from "@/components/ui/primitives";
import { CLIENT_STATUS, ENGAGEMENT, HEALTH } from "@/lib/taxonomy";
import type { ClientView } from "@/lib/queries";
import { ClientEditor } from "./client-editor";

export type ClientMoney = {
  monthly: string;
  /** Set only for one-off projects: the whole contract, not the monthly slice. */
  total: string | null;
  margin: number | null;
};

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
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<ClientView | null>(null);
  const [open, setOpen] = useState(false);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (status !== "all" && client.status !== status) return false;
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        (client.owner ?? "").toLowerCase().includes(needle) ||
        client.services.some((service) => service.toLowerCase().includes(needle))
      );
    });
  }, [clients, query, status]);

  function edit(client: ClientView | null) {
    setEditing(client);
    setOpen(true);
  }

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
        <div className="w-[130px] shrink-0">
          <Select
            value={status}
            onChange={(event) => setStatus(event.target.value)}
            aria-label="Filter by status"
          >
            <option value="active">Active</option>
            <option value="paused">Paused</option>
            <option value="churned">Churned</option>
            <option value="all">All</option>
          </Select>
        </div>
        <Button variant="primary" onClick={() => edit(null)} className="shrink-0">
          <Plus size={14} />
          Add client
        </Button>
      </div>

      <Card padded={false}>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Users size={22} />}
            title={clients.length === 0 ? "No clients yet" : "Nothing matches that"}
            hint={
              clients.length === 0
                ? "Add the accounts you're running. Invoices, reminders and the founder numbers all read from this list."
                : "Try a different search, or switch the status filter to all."
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
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Client</Th>
                <Th>Services</Th>
                <Th>Engagement</Th>
                <Th align="right">Value</Th>
                {canEditValues && <Th align="right">Margin</Th>}
                <Th>Status</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((client) => {
                const figures = money[client.id];

                return (
                  <tr key={client.id} className="transition-colors hover:bg-[var(--color-surface-2)]">
                    <Td>
                      <div className="flex min-w-0 items-center gap-2">
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
                        {client.health && (
                          <span
                            aria-label={HEALTH[client.health].label}
                            title={`${HEALTH[client.health].label} — ${HEALTH[client.health].hint}`}
                            className="h-1.5 w-1.5 shrink-0 rounded-full"
                            style={{ background: HEALTH[client.health].tone }}
                          />
                        )}
                      </div>
                      {client.owner && (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-ink-3)]">{client.owner}</p>
                      )}
                    </Td>

                    <Td>
                      <div className="flex max-w-[260px] flex-wrap gap-1">
                        {client.services.length === 0 ? (
                          <span className="text-[12px] text-[var(--color-ink-3)]">—</span>
                        ) : (
                          client.services.slice(0, 3).map((service) => (
                            <Chip key={service} tone="var(--color-ink-2)">
                              {service}
                            </Chip>
                          ))
                        )}
                        {client.services.length > 3 && (
                          <Chip
                            tone="var(--color-ink-3)"
                            title={client.services.slice(3).join(", ")}
                          >
                            +{client.services.length - 3}
                          </Chip>
                        )}
                      </div>
                    </Td>

                    <Td>
                      <span className="text-[12.5px]">{ENGAGEMENT[client.engagement].label}</span>
                      <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
                        Bills day {client.billing_day} · net {client.terms_days}
                      </p>
                    </Td>

                    <Td align="right">
                      {!figures ? (
                        <Redacted />
                      ) : (
                        <>
                          <span className="tabular font-medium">{figures.monthly}</span>
                          {figures.total && (
                            <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
                              {figures.total} total
                            </p>
                          )}
                        </>
                      )}
                    </Td>

                    {canEditValues && (
                      <Td align="right">
                        {!figures || figures.margin === null ? (
                          <span className="text-[var(--color-ink-3)]">—</span>
                        ) : (
                          <span
                            className="tabular font-medium"
                            style={{
                              color:
                                figures.margin < 20
                                  ? "var(--color-critical)"
                                  : figures.margin < 40
                                    ? "var(--color-warning)"
                                    : "var(--color-good)",
                            }}
                          >
                            {figures.margin.toFixed(0)}%
                          </span>
                        )}
                      </Td>
                    )}

                    <Td>
                      <Chip tone={CLIENT_STATUS[client.status].tone}>
                        {CLIENT_STATUS[client.status].label}
                      </Chip>
                    </Td>

                    <Td align="right">
                      <button
                        onClick={() => edit(client)}
                        aria-label={`Edit ${client.name}`}
                        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                      >
                        <Pencil size={13} />
                      </button>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <ClientEditor
        open={open}
        onClose={() => setOpen(false)}
        client={editing}
        canEditValues={canEditValues}
        currencySymbol={currencySymbol}
      />
    </>
  );
}
