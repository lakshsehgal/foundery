"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { BadgeCheck, Check, Undo2 } from "lucide-react";
import {
  markInvoicePaid, markInvoiceRaised, unmarkInvoicePaid, unmarkInvoiceRaised,
} from "@/app/actions/invoices";
import type { ActionState } from "@/app/actions/clients";

type MarkAction = (prev: ActionState, form: FormData) => Promise<ActionState>;

function TaskButton({
  clientId, month, action, children, variant, title,
}: {
  clientId: number;
  month: string;
  action: MarkAction;
  children: React.ReactNode;
  variant: "primary" | "good" | "ghost";
  title?: string;
}) {
  const [state, formAction, pending] = useActionState<ActionState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  const look =
    variant === "primary"
      ? "bg-[var(--color-brand)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] hover:bg-[var(--color-brand-hover)]"
      : variant === "good"
        ? "border border-[color-mix(in_srgb,var(--color-good)_45%,transparent)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-good)] hover:bg-[color-mix(in_srgb,var(--color-good)_10%,transparent)]"
        : "px-2 py-1 text-[11.5px] font-medium text-[var(--color-ink-3)] hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]";

  return (
    <form action={formAction}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        title={title}
        className={`inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] transition-colors active:scale-[0.97] disabled:opacity-50 ${look}`}
      >
        {children}
      </button>
    </form>
  );
}

/** The first tick: "I've raised this month's invoice in Zoho." */
export function MarkRaisedButton({ clientId, month }: { clientId: number; month: string }) {
  return (
    <TaskButton clientId={clientId} month={month} action={markInvoiceRaised} variant="primary">
      <Check size={13} />
      Mark raised
    </TaskButton>
  );
}

/** The second tick: the payment actually landed. */
export function MarkPaidButton({ clientId, month }: { clientId: number; month: string }) {
  return (
    <TaskButton clientId={clientId} month={month} action={markInvoicePaid} variant="good">
      <BadgeCheck size={13} />
      Payment received
    </TaskButton>
  );
}

export function UndoMarkButton({ clientId, month }: { clientId: number; month: string }) {
  return (
    <TaskButton
      clientId={clientId}
      month={month}
      action={unmarkInvoiceRaised}
      variant="ghost"
      title="Undo — put it back on the list"
    >
      <Undo2 size={12} />
      Undo
    </TaskButton>
  );
}

export function UndoPaidButton({ clientId, month }: { clientId: number; month: string }) {
  return (
    <TaskButton
      clientId={clientId}
      month={month}
      action={unmarkInvoicePaid}
      variant="ghost"
      title="Undo the payment tick — the raise mark stays"
    >
      <Undo2 size={12} />
      Undo
    </TaskButton>
  );
}
