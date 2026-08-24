"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Pencil } from "lucide-react";
import { savePnlMonth } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";

export type MonthDraft = {
  month: string;
  label: string;
  otherIncome: number;
  oneOffCosts: number;
  taxRatePct: number;
  notes: string | null;
  closed: boolean;
};

/**
 * The trigger owns whether the dialog is open; the dialog owns the submission.
 * Splitting them keeps the "it saved, so close" effect on the far side of a
 * prop boundary — same shape as every other editor in the app — and remounting
 * the dialog per open resets any error left over from last time.
 */
export function MonthEditor({ month, currencySymbol }: { month: MonthDraft; currencySymbol: string }) {
  const [openedAt, setOpenedAt] = useState(0);

  return (
    <>
      <button
        onClick={() => setOpenedAt((count) => count + 1)}
        aria-label={`Adjust ${month.label}`}
        title={`Adjust ${month.label}`}
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
      >
        <Pencil size={13} />
      </button>

      {openedAt > 0 && (
        <MonthDialog
          key={openedAt}
          month={month}
          currencySymbol={currencySymbol}
          onClose={() => setOpenedAt(0)}
        />
      )}
    </>
  );
}

function MonthDialog({
  month, currencySymbol, onClose,
}: {
  month: MonthDraft; currencySymbol: string; onClose: () => void;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(savePnlMonth, {});

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onClose();
    }
  }, [state, onClose]);

  return (
      <Dialog
        open
        onClose={onClose}
        title={month.label}
        description="Everything invoiced and everything spent is already counted. This is for the bits that aren't."
        width={520}
      >
        <form action={action} className="space-y-4">
          <input type="hidden" name="month" value={month.month} />

          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label={`Income from elsewhere (${currencySymbol})`}
              htmlFor="other_income"
              hint="Consulting days, referral fees — money in that never became an invoice here."
            >
              <TextInput
                id="other_income"
                name="other_income"
                inputMode="decimal"
                defaultValue={month.otherIncome || ""}
                placeholder="0"
              />
            </Field>
            <Field
              label={`One-off spend (${currencySymbol})`}
              htmlFor="one_off_costs"
              hint="Kit, a deposit, a legal bill — spend that isn't in the monthly base."
            >
              <TextInput
                id="one_off_costs"
                name="one_off_costs"
                inputMode="decimal"
                defaultValue={month.oneOffCosts || ""}
                placeholder="0"
              />
            </Field>
          </div>

          <Field
            label="Tax to hold back (%)"
            htmlFor="tax_rate"
            hint="Applied to profit, and only when the month made one."
          >
            <TextInput
              id="tax_rate"
              name="tax_rate"
              inputMode="decimal"
              defaultValue={month.taxRatePct || ""}
              placeholder="25"
            />
          </Field>

          <Field label="Notes" htmlFor="notes" hint="Why this month looks the way it does.">
            <TextArea id="notes" name="notes" rows={2} defaultValue={month.notes ?? ""} />
          </Field>

          <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5">
            <input
              type="checkbox"
              name="closed"
              defaultChecked={month.closed}
              className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
            />
            <span className="min-w-0">
              <span className="block text-[13px] font-medium">Books closed for this month</span>
              <span className="block text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
                Marks it as final. The figures still recalculate if you change an invoice — this is a
                note to yourself, not a lock.
              </span>
            </span>
          </label>

          {state.error && (
            <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">
              {state.error}
            </p>
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={pending}>
              Save month
            </Button>
          </DialogFooter>
        </form>
      </Dialog>
  );
}
