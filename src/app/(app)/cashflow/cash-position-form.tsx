"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Save } from "lucide-react";
import { saveCashPosition } from "@/app/actions/settings";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, TextInput } from "@/components/ui/form";

/**
 * The one number the calendar can't derive: what's actually in the bank.
 * Updating it takes five seconds whenever you glance at the account.
 */
export function CashPositionForm({
  balance, salaryDay, currencySymbol,
}: {
  balance: number | null;
  salaryDay: number;
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveCashPosition, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap items-end gap-3">
      <div className="w-[190px]">
        <Field
          label={`Bank balance today (${currencySymbol})`}
          htmlFor="bank_balance"
          hint="The calendar projects from here."
        >
          <TextInput
            id="bank_balance"
            name="bank_balance"
            inputMode="decimal"
            defaultValue={balance ?? ""}
            placeholder="0"
          />
        </Field>
      </div>
      <div className="w-[130px]">
        <Field label="Salaries go out on" htmlFor="salary_day" hint="Day of the month.">
          <TextInput
            id="salary_day"
            name="salary_day"
            type="number"
            min={1}
            max={28}
            defaultValue={salaryDay}
          />
        </Field>
      </div>
      <Button type="submit" variant="primary" loading={pending} className="mb-[26px] shrink-0">
        {!pending && <Save size={13} />}
        Update
      </Button>
    </form>
  );
}
