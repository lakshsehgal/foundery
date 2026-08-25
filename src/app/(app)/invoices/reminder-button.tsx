"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Mail, Send } from "lucide-react";
import { sendPaymentReminder } from "@/app/actions/invoices";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

/**
 * The nudge: a short, human check-in about a pending payment, sent from the
 * accounts desk. Everything is prefilled from the task and the client
 * profile; the form exists so the details can be corrected before it goes.
 */
function ReminderForm({
  clientId, clientName, billingEmail, billingCc, monthLabel, amountLabel, onClose,
}: {
  clientId: number;
  clientName: string;
  billingEmail: string | null;
  billingCc: string | null;
  monthLabel: string;
  amountLabel: string | null;
  onClose: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(sendPaymentReminder, {});

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onClose();
    }
  }, [state, onClose]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="client_id" value={clientId} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Brand name" htmlFor="rem_brand">
          <TextInput id="rem_brand" name="brand" defaultValue={clientName} required />
        </Field>
        <Field label="For the month" htmlFor="rem_month">
          <TextInput id="rem_month" name="month_label" defaultValue={monthLabel} />
        </Field>
        <Field
          label="Invoice amount / due amount"
          htmlFor="rem_amount"
          hint="Goes into the email as written — include the currency."
        >
          <TextInput id="rem_amount" name="amount" defaultValue={amountLabel ?? ""} placeholder="₹1,20,000" />
        </Field>
        <Field label="Invoice numbers" htmlFor="rem_numbers" hint="From Zoho, comma-separate several.">
          <TextInput id="rem_numbers" name="invoice_numbers" placeholder="e.g. INV-000241" />
        </Field>
        <Field
          label="To"
          htmlFor="rem_to"
          hint={billingEmail ? "From the client's profile." : "Not on their profile yet — add it there and it prefills."}
        >
          <TextInput id="rem_to" name="to" type="email" defaultValue={billingEmail ?? ""} required />
        </Field>
        <Field label="CC" htmlFor="rem_cc" hint="Comma-separate several.">
          <TextInput id="rem_cc" name="cc" defaultValue={billingCc ?? ""} placeholder="finance@client.com" />
        </Field>
      </div>

      <p className="rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
        Sends a short, personally-written check-in from <b>Neuroid Accounts</b> — no template
        furniture, so it reads like a person asking, not a system chasing.
      </p>

      {state.error && (
        <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">{state.error}</p>
      )}

      <DialogFooter>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" loading={pending}>
          {!pending && <Send size={13} />}
          Send reminder
        </Button>
      </DialogFooter>
    </form>
  );
}

export function ReminderButton(props: {
  clientId: number;
  clientName: string;
  billingEmail: string | null;
  billingCc: string | null;
  monthLabel: string;
  amountLabel: string | null;
}) {
  const [open, setOpen] = useState(false);
  // Bumped per open so each open is a fresh mount with fresh action state.
  const [openedAt, setOpenedAt] = useState(0);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpen(true);
          setOpenedAt((n) => n + 1);
        }}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-2)] hover:text-[var(--color-ink)] active:scale-[0.97]"
      >
        <Mail size={13} />
        Send reminder
      </button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={`Payment check-in — ${props.clientName}`}
        description="A friendly nudge about the pending payment, to their billing contact."
        width={560}
      >
        <ReminderForm key={openedAt} {...props} onClose={() => setOpen(false)} />
      </Dialog>
    </>
  );
}
