"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Receipt } from "lucide-react";
import { markInvoicePaid } from "@/app/actions/invoices";
import type { ActionState } from "@/app/actions/clients";
import { Button, Select } from "@/components/ui/form";
import {
  Card, EmptyState, Pill, Redacted, TableWrap, Td, Th,
} from "@/components/ui/primitives";
import { INVOICE_STATUS } from "@/lib/taxonomy";
import type { InvoiceView } from "@/lib/queries";
import { InvoiceEditor } from "./invoice-editor";

export type InvoiceRowDisplay = InvoiceView & {
  amountLabel: string | null;
  outstandingLabel: string | null;
  issueLabel: string;
  dueLabel: string;
};

/** How long until it's due, said the way a person would say it. */
function dueWording(row: InvoiceRowDisplay): { text: string; tone: string } {
  if (row.status === "paid") return { text: "Settled", tone: "var(--color-good)" };
  if (row.status === "void") return { text: "Void", tone: "var(--color-ink-3)" };
  const days = row.daysUntilDue ?? 0;
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, tone: "var(--color-critical)" };
  if (days === 0) return { text: "Due today", tone: "var(--color-serious)" };
  if (days <= 10) return { text: `Due in ${days}d`, tone: "var(--color-warning)" };
  return { text: `Due in ${days}d`, tone: "var(--color-ink-3)" };
}

function MarkPaidButton({ id, number }: { id: number; number: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(markInvoicePaid, {});

  useEffect(() => {
    if (state.ok) toast.success(`${number} marked as paid.`);
    if (state.error) toast.error(state.error);
  }, [state, number]);

  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        disabled={pending}
        title={`Mark ${number} as paid in full, today`}
        aria-label={`Mark ${number} as paid`}
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-good)_16%,transparent)] hover:text-[var(--color-good)] disabled:opacity-50"
      >
        <Check size={14} />
      </button>
    </form>
  );
}

export function InvoicesView({
  invoices, clients, canEditAmounts, canDelete, currencySymbol, suggestedNumber, today,
}: {
  invoices: InvoiceRowDisplay[];
  clients: { id: number; name: string; terms_days: number }[];
  canEditAmounts: boolean;
  canDelete: boolean;
  currencySymbol: string;
  suggestedNumber: string;
  today: string;
}) {
  const [filter, setFilter] = useState("open");
  const [editing, setEditing] = useState<InvoiceView | null>(null);
  const [open, setOpen] = useState(false);

  const shown = useMemo(() => {
    if (filter === "all") return invoices;
    if (filter === "open") return invoices.filter((i) => i.status !== "paid" && i.status !== "void");
    if (filter === "overdue") return invoices.filter((i) => i.overdue);
    return invoices.filter((i) => i.status === filter);
  }, [invoices, filter]);

  function edit(invoice: InvoiceView | null) {
    setEditing(invoice);
    setOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[170px] shrink-0">
          <Select value={filter} onChange={(event) => setFilter(event.target.value)} aria-label="Filter invoices">
            <option value="open">Open</option>
            <option value="overdue">Overdue</option>
            <option value="draft">Drafts</option>
            <option value="paid">Paid</option>
            <option value="all">All</option>
          </Select>
        </div>
        <span className="text-[12px] text-[var(--color-ink-3)]">
          {shown.length} of {invoices.length}
        </span>
        <Button variant="primary" onClick={() => edit(null)} className="ml-auto shrink-0">
          <Plus size={14} />
          Raise invoice
        </Button>
      </div>

      <Card padded={false}>
        {shown.length === 0 ? (
          <EmptyState
            icon={<Receipt size={22} />}
            title={invoices.length === 0 ? "No invoices yet" : "Nothing here"}
            hint={
              invoices.length === 0
                ? "Raise one and Foundery starts counting the days to its due date for you."
                : "Everything in this filter is settled. Try another one."
            }
            action={
              invoices.length === 0 ? (
                <Button variant="primary" onClick={() => edit(null)}>
                  <Plus size={14} />
                  Raise the first one
                </Button>
              ) : undefined
            }
          />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Invoice</Th>
                <Th>Client</Th>
                <Th>Issued</Th>
                <Th>Due</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Outstanding</Th>
                <Th>Status</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => {
                const due = dueWording(row);
                return (
                  <tr
                    key={row.id}
                    className="transition-colors hover:bg-[var(--color-surface-2)]"
                    style={
                      row.overdue
                        ? { background: "color-mix(in srgb, var(--color-critical) 5%, transparent)" }
                        : undefined
                    }
                  >
                    <Td>
                      <span className="font-medium">{row.number}</span>
                      {row.period && (
                        <p className="mt-0.5 truncate text-[11px] text-[var(--color-ink-3)]">{row.period}</p>
                      )}
                    </Td>
                    <Td>
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="min-w-0 truncate">{row.client_name}</span>
                        {row.vip && (
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
                    <Td>
                      <span className="text-[12.5px] text-[var(--color-ink-2)]">{row.issueLabel}</span>
                    </Td>
                    <Td>
                      <span className="text-[12.5px] text-[var(--color-ink-2)]">{row.dueLabel}</span>
                      <p className="mt-0.5 text-[11px] font-medium" style={{ color: due.tone }}>
                        {due.text}
                      </p>
                    </Td>
                    <Td align="right">
                      {row.amountLabel === null ? (
                        <Redacted />
                      ) : (
                        <span className="tabular">{row.amountLabel}</span>
                      )}
                    </Td>
                    <Td align="right">
                      {row.outstandingLabel === null ? (
                        <span className="text-[var(--color-ink-3)]">—</span>
                      ) : (
                        <span
                          className="tabular font-medium"
                          style={row.overdue ? { color: "var(--color-critical)" } : undefined}
                        >
                          {row.outstandingLabel}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <Pill fill={INVOICE_STATUS[row.status].tone}>
                        {INVOICE_STATUS[row.status].label}
                      </Pill>
                    </Td>
                    <Td align="right">
                      <div className="flex items-center justify-end gap-0.5">
                        {row.status !== "paid" && row.status !== "void" && (
                          <MarkPaidButton id={row.id} number={row.number} />
                        )}
                        <button
                          onClick={() => edit(row)}
                          aria-label={`Edit ${row.number}`}
                          className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                        >
                          <Pencil size={13} />
                        </button>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </TableWrap>
        )}
      </Card>

      <InvoiceEditor
        key={editing?.id ?? "new"}
        open={open}
        onClose={() => setOpen(false)}
        invoice={editing}
        clients={clients}
        canEditAmounts={canEditAmounts}
        canDelete={canDelete}
        currencySymbol={currencySymbol}
        suggestedNumber={suggestedNumber}
        today={today}
      />
    </>
  );
}
