"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Check, Undo2 } from "lucide-react";
import { markInvoiceRaised, unmarkInvoiceRaised } from "@/app/actions/invoices";
import type { ActionState } from "@/app/actions/clients";

/** The tick: "I've raised this month's invoice in Zoho." */
export function MarkRaisedButton({ clientId, month }: { clientId: number; month: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(markInvoiceRaised, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] bg-[var(--color-brand)] px-3 py-1.5 text-[12px] font-semibold text-[var(--color-brand-ink)] transition-colors hover:bg-[var(--color-brand-hover)] active:scale-[0.97] disabled:opacity-50"
      >
        <Check size={13} />
        Mark raised
      </button>
    </form>
  );
}

export function UndoMarkButton({ clientId, month }: { clientId: number; month: string }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(unmarkInvoiceRaised, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="client_id" value={clientId} />
      <input type="hidden" name="month" value={month} />
      <button
        type="submit"
        disabled={pending}
        title="Undo — put it back on the list"
        className="inline-flex items-center gap-1 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-medium text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)] disabled:opacity-50"
      >
        <Undo2 size={12} />
        Undo
      </button>
    </form>
  );
}
