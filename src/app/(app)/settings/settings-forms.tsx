"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveBusiness, saveVisibility } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, TextInput } from "@/components/ui/form";
import { Card, CardTitle } from "@/components/ui/primitives";

export function VisibilityForm({
  switches, currencySymbol,
}: {
  switches: { key: string; label: string; hint: string; value: boolean }[];
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveVisibility, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <form action={action}>
        <CardTitle
          title="What the operator sees"
          hint="Off means the figure is replaced with a lock on their screen — and never sent to their browser in the first place."
        />

        <div className="space-y-2">
          {switches.map((item) => (
            <label
              key={item.key}
              className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5"
            >
              <input
                type="checkbox"
                name={item.key}
                defaultChecked={item.value}
                className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
              />
              <span className="min-w-0">
                <span className="block text-[13px] font-medium">{item.label}</span>
                <span className="block text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
                  {item.hint}
                </span>
              </span>
            </label>
          ))}
        </div>

        <div className="mt-3 rounded-[var(--radius-md)] border border-[var(--color-line)] px-3 py-2.5">
          <p className="text-[13px] font-medium">Individual salaries</p>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
            Always hidden. The operator sees what the team costs in total, never what one person
            earns, and there is no switch for it — that is the point of having two passcodes.
          </p>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button type="submit" variant="primary" loading={pending}>
            Save
          </Button>
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            Amounts are shown in {currencySymbol}.
          </span>
        </div>
      </form>
    </Card>
  );
}

export function BusinessForm({
  businessName, cashBuffer, currencySymbol,
}: {
  businessName: string;
  cashBuffer: string;
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveBusiness, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <form action={action}>
        <CardTitle title="The business" hint="Used by the founder dashboard." />

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Name" htmlFor="business_name">
            <TextInput id="business_name" name="business_name" defaultValue={businessName} />
          </Field>
          <Field
            label={`Cash in the bank (${currencySymbol})`}
            htmlFor="cash_buffer"
            hint="Turns into runway: how many months the cost base survives with no new revenue. Leave empty and runway shows a dash rather than a guess."
          >
            <TextInput
              id="cash_buffer"
              name="cash_buffer"
              inputMode="decimal"
              defaultValue={cashBuffer}
              placeholder="0"
            />
          </Field>
        </div>

        <div className="mt-4">
          <Button type="submit" variant="primary" loading={pending}>
            Save
          </Button>
        </div>
      </form>
    </Card>
  );
}
