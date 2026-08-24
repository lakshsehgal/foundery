"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { deleteInvoice, saveInvoice } from "@/app/actions/invoices";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { INVOICE_STATUS, type InvoiceStatus } from "@/lib/taxonomy";
import type { InvoiceView } from "@/lib/queries";

export function InvoiceEditor({
  open, onClose, invoice, clients, canEditAmounts, canDelete, currencySymbol, suggestedNumber, today,
}: {
  open: boolean;
  onClose: () => void;
  invoice: InvoiceView | null;
  clients: { id: number; name: string; terms_days: number }[];
  canEditAmounts: boolean;
  canDelete: boolean;
  currencySymbol: string;
  suggestedNumber: string;
  today: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveInvoice, {});
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(deleteInvoice, {});
  // The parent gives this component a key per invoice, so opening a different
  // one remounts it and this initialiser runs again. That is React's answer to
  // "reset state when the props change" — syncing it back in an effect costs a
  // second render and can show the previous invoice's status for a frame.
  const [status, setStatus] = useState<InvoiceStatus>(invoice?.status ?? "draft");

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onClose();
    }
  }, [state, onClose]);

  useEffect(() => {
    if (removeState.ok) {
      toast.success(removeState.ok);
      onClose();
    }
  }, [removeState, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={invoice ? `Invoice ${invoice.number}` : "Raise an invoice"}
      description={
        canEditAmounts
          ? "Terms decide the due date, and the due date is what Foundery counts down from."
          : "You can set the dates, terms and status. The amount is the founder's to set."
      }
      width={580}
    >
      <form action={action} className="space-y-4">
        {invoice && <input type="hidden" name="id" value={invoice.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client" htmlFor="client_id">
            <Select id="client_id" name="client_id" defaultValue={invoice?.client_id ?? ""} required>
              <option value="" disabled>
                Pick a client
              </option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Invoice number" htmlFor="number" hint={invoice ? "Fixed once raised." : "Next in sequence."}>
            <TextInput
              id="number"
              name="number"
              defaultValue={invoice?.number ?? suggestedNumber}
              disabled={Boolean(invoice)}
            />
          </Field>
        </div>

        <Field label="What it covers" htmlFor="period" hint="A month, or a phase name.">
          <TextInput
            id="period"
            name="period"
            defaultValue={invoice?.period ?? ""}
            placeholder="2026-08, or Phase 2 — build"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Issued" htmlFor="issue_date">
            <TextInput
              id="issue_date"
              name="issue_date"
              type="date"
              defaultValue={invoice?.issue_date ?? today}
            />
          </Field>
          <Field label="Terms" htmlFor="terms_days" hint="Days to pay.">
            <TextInput
              id="terms_days"
              name="terms_days"
              type="number"
              min={0}
              max={120}
              defaultValue={invoice?.terms_days ?? 15}
            />
          </Field>
          <Field label="Due" htmlFor="due_date" hint="Blank = issued + terms.">
            <TextInput id="due_date" name="due_date" type="date" defaultValue={invoice?.due_date ?? ""} />
          </Field>
        </div>

        {canEditAmounts && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={`Amount (${currencySymbol})`} htmlFor="amount">
              <TextInput id="amount" name="amount" inputMode="decimal" defaultValue={invoice?.amount ?? ""} />
            </Field>
            <Field
              label={`Received so far (${currencySymbol})`}
              htmlFor="amount_paid"
              hint="Marking it paid fills this in for you."
            >
              <TextInput
                id="amount_paid"
                name="amount_paid"
                inputMode="decimal"
                defaultValue={invoice?.amount_paid ?? ""}
              />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Status" htmlFor="status">
            <Select
              id="status"
              name="status"
              value={status}
              onChange={(event) => setStatus(event.target.value as InvoiceStatus)}
            >
              {(Object.keys(INVOICE_STATUS) as InvoiceStatus[]).map((key) => (
                <option key={key} value={key}>
                  {INVOICE_STATUS[key].label}
                </option>
              ))}
            </Select>
          </Field>
          <Field
            label="Paid on"
            htmlFor="paid_date"
            hint={status === "paid" ? "Blank means today." : "Only once it's in."}
          >
            <TextInput id="paid_date" name="paid_date" type="date" defaultValue={invoice?.paid_date ?? ""} />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes" hint="What you told them, and when.">
          <TextArea id="notes" name="notes" rows={2} defaultValue={invoice?.notes ?? ""} />
        </Field>

        {(state.error || removeState.error) && (
          <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">
            {state.error || removeState.error}
          </p>
        )}

        <DialogFooter>
          {invoice && canDelete && (
            <Button
              type="submit"
              variant="danger"
              formAction={removeAction}
              loading={removing}
              className="mr-auto"
              onClick={(event) => {
                if (!window.confirm(`Delete ${invoice.number}? It disappears from the P&L too.`)) {
                  event.preventDefault();
                }
              }}
            >
              Delete
            </Button>
          )}
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={pending}>
            {invoice ? "Save changes" : "Raise invoice"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
