"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveCost, deleteCost, type ActionState } from "@/app/actions/clients";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { CADENCES, COST_CATEGORIES } from "@/lib/taxonomy";
import type { CostView } from "@/lib/queries";

export function CostEditor({
  open, onClose, cost, currencySymbol, clients,
}: {
  open: boolean;
  onClose: () => void;
  cost: CostView | null;
  currencySymbol: string;
  clients: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCost, {});
  const [removeState, removeAction, removing] = useActionState<ActionState, FormData>(deleteCost, {});

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
      title={cost ? `Edit ${cost.label}` : "Add a cost"}
      description="Anything that leaves the account every month, or once a year, or once."
      width={580}
    >
      <form action={action} className="space-y-4">
        {cost?.id && <input type="hidden" name="id" value={cost.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Category" htmlFor="category">
            <Select id="category" name="category" defaultValue={cost?.category ?? "tools"}>
              {COST_CATEGORIES.map((category) => (
                <option key={category.key} value={category.key}>
                  {category.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="What is it" htmlFor="label" hint="The words you'd use, not the invoice's words.">
            <TextInput
              id="label"
              name="label"
              defaultValue={cost?.label ?? ""}
              placeholder="Media buyer, Figma, UGC pool…"
              required
              autoFocus
            />
          </Field>
        </div>

        <Field
          label="Person"
          htmlFor="person"
          hint="Only used on salary and contractor lines. Never shown to the operator."
        >
          <TextInput id="person" name="person" defaultValue={cost?.person ?? ""} placeholder="Optional" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label={`Amount (${currencySymbol})`} htmlFor="amount">
            <TextInput
              id="amount"
              name="amount"
              inputMode="decimal"
              defaultValue={cost?.amount ?? ""}
              required
            />
          </Field>
          <Field label="How often" htmlFor="cadence" hint="Annual is shown ÷12.">
            <Select id="cadence" name="cadence" defaultValue={cost?.cadence ?? "monthly"}>
              {CADENCES.map((cadence) => (
                <option key={cadence.key} value={cadence.key}>
                  {cadence.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Against a client" htmlFor="client_id" hint="Optional.">
            <Select id="client_id" name="client_id" defaultValue={cost?.client_id ?? ""}>
              <option value="">Whole business</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Started" htmlFor="start_date" hint="Used to place it in the right P&L month.">
            <TextInput id="start_date" name="start_date" type="date" defaultValue={cost?.start_date ?? ""} />
          </Field>
          <Field label="Ended" htmlFor="end_date" hint="Leave empty while it's still running.">
            <TextInput id="end_date" name="end_date" type="date" defaultValue={cost?.end_date ?? ""} />
          </Field>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <input
            type="checkbox"
            name="active"
            defaultChecked={cost?.active ?? true}
            className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Still running</span>
            <span className="block text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              Turning this off keeps the history in the P&amp;L but takes it out of the monthly cost base.
            </span>
          </span>
        </label>

        <Field label="Notes" htmlFor="notes">
          <TextArea id="notes" name="notes" rows={2} defaultValue={cost?.notes ?? ""} />
        </Field>

        {(state.error || removeState.error) && (
          <p role="alert" className="text-[12.5px] text-[var(--color-critical)]">
            {state.error || removeState.error}
          </p>
        )}

        <DialogFooter>
          {cost?.id && (
            <Button
              type="submit"
              variant="danger"
              formAction={removeAction}
              loading={removing}
              className="mr-auto"
              onClick={(event) => {
                if (!window.confirm(`Delete “${cost.label}”? It comes out of every past month too.`)) {
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
            {cost ? "Save changes" : "Add cost"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
