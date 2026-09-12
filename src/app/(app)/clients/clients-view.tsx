"use client";

import { useActionState, useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { toast } from "sonner";
import {
  Check, Copy, Crown, LayoutGrid, Pencil, Plus, Rocket, Search, TableProperties, Users,
} from "lucide-react";
import { startOnboarding } from "@/app/actions/onboarding";
import type { ActionState } from "@/app/actions/clients";
import { Button, Select, TextInput } from "@/components/ui/form";
import { avatarTint, Chip, EmptyState, Redacted, TableWrap, Td, Th } from "@/components/ui/primitives";
import {
  CLIENT_STATUS, ENGAGEMENT, HEALTH, ONBOARDING_FLOWS, ONBOARDING_STATUS,
  type ClientStatus, type OnboardingFlow, type OnboardingStatus,
} from "@/lib/taxonomy";
import type { ClientView } from "@/lib/queries";
import { prettyDate } from "@/lib/dates";
import { fmtMoney, type CurrencyCode } from "@/lib/money";
import { ClientEditor } from "./client-editor";

export type ClientMoney = {
  monthly: string;
  /** Set only for one-off projects: the whole contract, not the monthly slice. */
  total: string | null;
  margin: number | null;
  /** The raw numbers behind the strings, so the list view can add them up. */
  monthlyValue: number;
  totalValue: number | null;
};

/**
 * Board or list is a taste, not data, so it lives in localStorage like the
 * sidebar's rail and theme — read with useSyncExternalStore so the server
 * renders the board default and the client corrects itself in one commit.
 */
const PREFS_EVENT = "foundery:prefs";
const VIEW_KEY = "foundery-clients-view";

function subscribePrefs(onChange: () => void) {
  window.addEventListener(PREFS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(PREFS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function readListPref(): boolean {
  try {
    return localStorage.getItem(VIEW_KEY) === "list";
  } catch {
    return false;
  }
}

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
function StartOnboardingButton({
  clientId, clientName, flow,
}: {
  clientId: number;
  clientName: string;
  flow: OnboardingFlow;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(startOnboarding, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} onClick={(event) => event.stopPropagation()}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="flow" value={flow} />
      <button
        type="submit"
        disabled={pending}
        title={`Start ${ONBOARDING_FLOWS[flow].label} onboarding for ${clientName}`}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)] disabled:opacity-50"
      >
        <Rocket size={12} />
        Start {ONBOARDING_FLOWS[flow].short.toLowerCase()}
      </button>
    </form>
  );
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Onboarding link copied — send it to the client.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — the link is on the Onboarding page.");
    }
  }

  return (
    <button
      onClick={copy}
      title="Copy the client's onboarding link"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      Copy link
    </button>
  );
}

function FootTd({
  children, align = "left", colSpan,
}: {
  children?: React.ReactNode; align?: "left" | "right"; colSpan?: number;
}) {
  return (
    <td
      colSpan={colSpan}
      className={`border-t border-[var(--color-line-strong)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12.5px] font-semibold ${
        align === "right" ? "tabular text-right" : "text-left"
      }`}
    >
      {children}
    </td>
  );
}

/**
 * The same book of business as the board, flattened into a spreadsheet: one
 * row per client, and the totals a spreadsheet would have at the bottom — the
 * retainer book as a monthly figure, projects as contract value.
 */
function ListTable({
  rows, money, buyers, currency, canEditValues, onEdit,
}: {
  rows: ClientView[];
  money: Record<number, ClientMoney>;
  buyers: { id: number; name: string }[];
  currency: CurrencyCode;
  canEditValues: boolean;
  onEdit: (client: ClientView) => void;
}) {
  const retainers = rows.filter((client) => client.engagement === "retainer");
  const projects = rows.filter((client) => client.engagement === "one_time");
  const sum = (list: ClientView[], pick: (figures: ClientMoney) => number) =>
    list.reduce((acc, client) => acc + (money[client.id] ? pick(money[client.id]) : 0), 0);
  const retainerMonthly = sum(retainers, (figures) => figures.monthlyValue);
  const projectMonthly = sum(projects, (figures) => figures.monthlyValue);
  const projectTotal = sum(projects, (figures) => figures.totalValue ?? 0);

  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
      <TableWrap>
        <thead>
          <tr>
            <Th>Client</Th>
            <Th>Deal</Th>
            <Th>Status</Th>
            <Th>Media buyer</Th>
            <Th>Billing</Th>
            <Th align="right">Monthly</Th>
            <Th align="right">Project total</Th>
            <Th align="right">Margin</Th>
          </tr>
        </thead>
        <tbody>
          {rows.map((client) => {
            const figures = money[client.id];
            const buyerName =
              client.engagement === "retainer"
                ? buyers.find((buyer) => buyer.id === client.media_buyer_id)?.name
                : undefined;
            return (
              <tr
                key={client.id}
                tabIndex={0}
                onClick={() => onEdit(client)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    onEdit(client);
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-surface-2)]"
              >
                <Td>
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: avatarTint(String(client.id)) }}
                    />
                    <span className="min-w-0 truncate font-semibold">{client.name}</span>
                    {client.vip && (
                      <Crown size={11} aria-label="VIP account" className="shrink-0 text-[var(--color-accent)]" />
                    )}
                    {client.health && (
                      <span
                        aria-label={HEALTH[client.health].label}
                        title={`${HEALTH[client.health].label} — ${HEALTH[client.health].hint}`}
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: HEALTH[client.health].tone }}
                      />
                    )}
                  </span>
                  {client.owner && (
                    <span className="mt-0.5 block truncate text-[11px] text-[var(--color-ink-3)]">
                      {client.owner}
                    </span>
                  )}
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] text-[var(--color-ink-2)]">
                  {ENGAGEMENT[client.engagement].short}
                </Td>
                <Td>
                  <span
                    className="whitespace-nowrap text-[12.5px] font-semibold"
                    style={{ color: CLIENT_STATUS[client.status].tone }}
                  >
                    {CLIENT_STATUS[client.status].label}
                  </span>
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] text-[var(--color-ink-2)]">
                  {client.engagement === "retainer" ? buyerName ?? "Unassigned" : "—"}
                </Td>
                <Td className="whitespace-nowrap text-[12.5px] text-[var(--color-ink-2)]">
                  {client.engagement === "one_time"
                    ? client.end_date
                      ? `Ships ${prettyDate(client.end_date)}`
                      : "No ship date"
                    : `Day ${client.billing_day} · net ${client.terms_days}`}
                </Td>
                <Td align="right" className="tabular whitespace-nowrap font-semibold">
                  {figures ? figures.monthly : <Redacted />}
                </Td>
                <Td align="right" className="tabular whitespace-nowrap text-[var(--color-ink-2)]">
                  {figures?.total ?? "—"}
                </Td>
                <Td align="right" className="tabular whitespace-nowrap font-semibold">
                  {figures && figures.margin !== null ? (
                    <span style={{ color: marginTone(figures.margin) }}>
                      {figures.margin.toFixed(0)}%
                    </span>
                  ) : (
                    "—"
                  )}
                </Td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr>
            <FootTd colSpan={5}>
              Retainers · {retainers.length}
              <span className="ml-1.5 font-normal text-[var(--color-ink-3)]">recurring book</span>
            </FootTd>
            <FootTd align="right">
              {canEditValues ? `${fmtMoney(retainerMonthly, currency)} / mo` : <Redacted />}
            </FootTd>
            <FootTd align="right">—</FootTd>
            <FootTd align="right" />
          </tr>
          {projects.length > 0 && (
            <tr>
              <FootTd colSpan={5}>
                One-off projects · {projects.length}
                <span className="ml-1.5 font-normal text-[var(--color-ink-3)]">
                  spread over their months
                </span>
              </FootTd>
              <FootTd align="right">
                {canEditValues ? `${fmtMoney(projectMonthly, currency)} / mo` : <Redacted />}
              </FootTd>
              <FootTd align="right">
                {canEditValues ? fmtMoney(projectTotal, currency) : <Redacted />}
              </FootTd>
              <FootTd align="right" />
            </tr>
          )}
          {retainers.length > 0 && projects.length > 0 && (
            <tr>
              <FootTd colSpan={5}>Everything · {rows.length} clients</FootTd>
              <FootTd align="right">
                {canEditValues ? (
                  `${fmtMoney(retainerMonthly + projectMonthly, currency)} / mo`
                ) : (
                  <Redacted />
                )}
              </FootTd>
              <FootTd align="right">—</FootTd>
              <FootTd align="right" />
            </tr>
          )}
        </tfoot>
      </TableWrap>
    </div>
  );
}

export function ClientsView({
  clients, canEditValues, currency, currencySymbol, money, onboardings, buyers,
}: {
  clients: ClientView[];
  canEditValues: boolean;
  currency: CurrencyCode;
  currencySymbol: string;
  /** Worked out and formatted on the server. Absent = not cleared to see it. */
  money: Record<number, ClientMoney>;
  /** Latest guided onboarding per client per flow, if any. */
  onboardings: Record<number, Record<string, { status: string; url: string }>>;
  /** The media-buying bench — id → name for the cards, full list for the editor. */
  buyers: { id: number; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("working");
  const [dealFilter, setDealFilter] = useState("all");
  const listView = useSyncExternalStore(subscribePrefs, readListPref, () => false);
  const setListView = useCallback((list: boolean) => {
    try {
      localStorage.setItem(VIEW_KEY, list ? "list" : "board");
    } catch {
      // Storage refused — nothing to do; the view stays where it was.
    }
    window.dispatchEvent(new Event(PREFS_EVENT));
  }, []);
  const [editing, setEditing] = useState<ClientView | null>(null);
  const [open, setOpen] = useState(false);
  // Bumped on every open: folded into the editor's key so each open is a
  // fresh mount with fresh action state. Without it, reopening "add client"
  // reused the previous mount, whose leftover "saved!" state instantly
  // re-closed the dialog.
  const [openedAt, setOpenedAt] = useState(0);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return clients.filter((client) => {
      if (statusFilter === "working" && client.status === "churned") return false;
      if (statusFilter !== "working" && statusFilter !== "all" && client.status !== statusFilter)
        return false;
      if (dealFilter !== "all" && client.engagement !== dealFilter) return false;
      if (!needle) return true;
      return (
        client.name.toLowerCase().includes(needle) ||
        (client.owner ?? "").toLowerCase().includes(needle) ||
        client.services.some((service) => service.toLowerCase().includes(needle))
      );
    });
  }, [clients, query, statusFilter, dealFilter]);

  function edit(client: ClientView | null) {
    setEditing(client);
    setOpen(true);
    setOpenedAt((n) => n + 1);
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
        <div className="w-[150px] shrink-0">
          <Select
            value={dealFilter}
            onChange={(event) => setDealFilter(event.target.value)}
            aria-label="Filter by deal type"
          >
            <option value="all">All deals</option>
            <option value="retainer">Retainers</option>
            <option value="one_time">One-off projects</option>
          </Select>
        </div>
        <div
          role="group"
          aria-label="View as board or list"
          className="flex shrink-0 overflow-hidden rounded-[var(--radius-sm)] border border-[var(--color-line-strong)]"
        >
          <button
            type="button"
            aria-pressed={!listView}
            title="Board — cards grouped by status"
            onClick={() => setListView(false)}
            className={`inline-flex items-center gap-1.5 px-2.5 py-2 text-[12px] font-semibold transition-colors ${
              listView
                ? "text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
                : "bg-[var(--color-surface-3)] text-[var(--color-ink)]"
            }`}
          >
            <LayoutGrid size={13} aria-hidden />
            Board
          </button>
          <button
            type="button"
            aria-pressed={listView}
            title="List — one row per client, totals at the bottom"
            onClick={() => setListView(true)}
            className={`inline-flex items-center gap-1.5 border-l border-[var(--color-line-strong)] px-2.5 py-2 text-[12px] font-semibold transition-colors ${
              listView
                ? "bg-[var(--color-surface-3)] text-[var(--color-ink)]"
                : "text-[var(--color-ink-3)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)]"
            }`}
          >
            <TableProperties size={13} aria-hidden />
            List
          </button>
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
      ) : listView ? (
        <ListTable
          rows={groups.flatMap((group) => group.clients)}
          money={money}
          buyers={buyers}
          currency={currency}
          canEditValues={canEditValues}
          onEdit={edit}
        />
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
                const onboarding = onboardings[client.id];
                const buyerName = buyers.find((b) => b.id === client.media_buyer_id)?.name;
                return (
                  <div
                    key={client.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => edit(client)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        edit(client);
                      }
                    }}
                    className="lift group cursor-pointer overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-left"
                  >
                    {/* The client's colour, everywhere they appear. */}
                    <div aria-hidden className="h-1.5 w-full" style={{ background: clientTone }} />

                    <div className="p-4">
                      <div className="flex min-w-0 items-center gap-2">
                        <span className="min-w-0 truncate text-[15px] font-bold tracking-tight">
                          {client.name}
                        </span>
                        <Pencil
                          size={11}
                          aria-hidden
                          className="shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-100"
                        />
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
                        {client.owner ? ` · ${client.owner}` : ""}
                        {client.engagement === "retainer" && buyerName ? ` · ${buyerName} on ads` : ""}
                        {client.engagement === "one_time"
                          ? client.end_date
                            ? ` · ships ${prettyDate(client.end_date)}`
                            : " · no ship date set"
                          : ` · bills day ${client.billing_day}`}{" "}
                        · net {client.terms_days}
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

                      {/* The mandate as closed — null for roles not cleared
                          to see values, so this renders for the same eyes
                          as the numbers above it. */}
                      {client.final_deal && (
                        <p
                          className="mt-2 flex min-w-0 items-baseline gap-1.5"
                          title={`Final deal — ${client.final_deal}`}
                        >
                          <span className="shrink-0 text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">
                            Deal
                          </span>
                          <span className="min-w-0 truncate text-[11.5px] font-medium">
                            {client.final_deal}
                          </span>
                        </p>
                      )}

                      {/* Onboarding strip: one row per flow — start, track, copy. */}
                      <div
                        className="mt-3 -mx-1 space-y-1 border-t border-[var(--color-line)] pt-2.5"
                        onClick={(event) => event.stopPropagation()}
                      >
                        {(Object.keys(ONBOARDING_FLOWS) as OnboardingFlow[]).map((flow) => {
                          const record = onboarding?.[flow];
                          return (
                            <div key={flow} className="flex flex-wrap items-center gap-1">
                              {record ? (
                                <>
                                  <span className="px-1 text-[11px] font-semibold text-[var(--color-ink-3)]">
                                    {ONBOARDING_FLOWS[flow].short}
                                  </span>
                                  <Chip
                                    tone={
                                      ONBOARDING_STATUS[record.status as OnboardingStatus]?.tone ??
                                      "var(--color-ink-3)"
                                    }
                                  >
                                    {ONBOARDING_STATUS[record.status as OnboardingStatus]?.label ??
                                      record.status}
                                  </Chip>
                                  <span className="ml-auto" />
                                  <CopyLinkButton url={record.url} />
                                </>
                              ) : (
                                <StartOnboardingButton
                                  clientId={client.id}
                                  clientName={client.name}
                                  flow={flow}
                                />
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}

      <ClientEditor
        key={`${editing?.id ?? "new"}-${openedAt}`}
        open={open}
        onClose={() => setOpen(false)}
        client={editing}
        canEditValues={canEditValues}
        currencySymbol={currencySymbol}
        buyers={buyers}
      />
    </>
  );
}
