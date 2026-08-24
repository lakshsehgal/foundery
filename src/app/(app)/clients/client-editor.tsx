"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { saveClient, type ActionState } from "@/app/actions/clients";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { SERVICES } from "@/lib/taxonomy";
import type { ClientView } from "@/lib/queries";

export function ClientEditor({
  open, onClose, client, canEditValues, currencySymbol,
}: {
  open: boolean;
  onClose: () => void;
  client: ClientView | null;
  canEditValues: boolean;
  currencySymbol: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveClient, {});

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onClose();
    }
  }, [state, onClose]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={client ? `Edit ${client.name}` : "Add a client"}
      description={
        canEditValues
          ? "What they bought, what it's worth, and what it costs to serve."
          : "Values and health are set by the founder — the rest is yours."
      }
      width={620}
    >
      <form action={action} className="space-y-4">
        {client && <input type="hidden" name="id" value={client.id} />}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Client name" htmlFor="name">
            <TextInput id="name" name="name" defaultValue={client?.name ?? ""} required autoFocus />
          </Field>
          <Field label="Who runs it here" htmlFor="owner" hint="The name the client asks for.">
            <TextInput id="owner" name="owner" defaultValue={client?.owner ?? ""} placeholder="Account owner" />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Engagement" htmlFor="engagement">
            <Select id="engagement" name="engagement" defaultValue={client?.engagement ?? "retainer"}>
              <option value="retainer">Monthly retainer</option>
              <option value="one_time">One-off project</option>
            </Select>
          </Field>
          <Field label="Status" htmlFor="status">
            <Select id="status" name="status" defaultValue={client?.status ?? "active"}>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
              <option value="churned">Churned</option>
            </Select>
          </Field>
          {canEditValues && (
            <Field label="Health" htmlFor="health" hint="Founder view only.">
              <Select id="health" name="health" defaultValue={client?.health ?? "green"}>
                <option value="green">Healthy</option>
                <option value="amber">Watch</option>
                <option value="red">At risk</option>
              </Select>
            </Field>
          )}
        </div>

        <fieldset>
          <legend className="mb-1.5 text-[12px] font-medium text-[var(--color-ink-2)]">Services</legend>
          <div className="flex flex-wrap gap-1.5">
            {SERVICES.map((service) => {
              const checked = client?.services.includes(service) ?? false;
              return (
                <label
                  key={service}
                  className="cursor-pointer select-none rounded-[var(--radius-xs)] border border-[var(--color-line-strong)] px-2 py-1 text-[12px] transition-colors has-[:checked]:border-transparent has-[:checked]:bg-[var(--color-brand)] has-[:checked]:font-medium has-[:checked]:text-[var(--color-brand-ink)]"
                >
                  <input
                    type="checkbox"
                    name="services"
                    value={service}
                    defaultChecked={checked}
                    className="sr-only"
                  />
                  {service}
                </label>
              );
            })}
          </div>
          <p className="mt-1 text-[11.5px] text-[var(--color-ink-3)]">
            What we actually deliver for them. Shows on the clients table for everyone.
          </p>
        </fieldset>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <input
            type="checkbox"
            name="vip"
            defaultChecked={client?.vip ?? false}
            className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">VIP account</span>
            <span className="block text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              Pins them to the top of every list and flags their invoices first when chasing.
            </span>
          </span>
        </label>

        {canEditValues && (
          <div className="grid gap-4 rounded-[var(--radius-md)] border border-[var(--color-line)] p-3.5 sm:grid-cols-3">
            <Field
              label="Zoho Books customer name"
              htmlFor="zoho_name"
              hint="Exactly as it appears in Zoho — usually the legal name. Used to match their invoices when syncing."
              className="sm:col-span-3"
            >
              <TextInput
                id="zoho_name"
                name="zoho_name"
                defaultValue={client?.zoho_name ?? ""}
                placeholder="e.g. MACKLY CLOTHING PRIVATE LIMITED"
              />
            </Field>
            <Field label={`Retainer / month (${currencySymbol})`} htmlFor="retainer_amount">
              <TextInput
                id="retainer_amount"
                name="retainer_amount"
                inputMode="decimal"
                defaultValue={client?.retainer_amount || ""}
                placeholder="0"
              />
            </Field>
            <Field label={`Project value (${currencySymbol})`} htmlFor="one_time_value">
              <TextInput
                id="one_time_value"
                name="one_time_value"
                inputMode="decimal"
                defaultValue={client?.one_time_value || ""}
                placeholder="0"
              />
            </Field>
            <Field
              label={`Cost to serve (${currencySymbol})`}
              htmlFor="delivery_cost"
              hint="Monthly. Drives the margin on the founder dashboard."
            >
              <TextInput
                id="delivery_cost"
                name="delivery_cost"
                inputMode="decimal"
                defaultValue={client?.delivery_cost || ""}
                placeholder="0"
              />
            </Field>
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Started" htmlFor="start_date">
            <TextInput id="start_date" name="start_date" type="date" defaultValue={client?.start_date ?? ""} />
          </Field>
          <Field label="Ends" htmlFor="end_date" hint="Leave empty if open-ended.">
            <TextInput id="end_date" name="end_date" type="date" defaultValue={client?.end_date ?? ""} />
          </Field>
          <Field label="Billing day" htmlFor="billing_day" hint="Day of the month.">
            <TextInput
              id="billing_day"
              name="billing_day"
              type="number"
              min={1}
              max={31}
              defaultValue={client?.billing_day ?? 1}
            />
          </Field>
          <Field label="Payment terms" htmlFor="terms_days" hint="Days to pay.">
            <TextInput
              id="terms_days"
              name="terms_days"
              type="number"
              min={0}
              max={120}
              defaultValue={client?.terms_days ?? 15}
            />
          </Field>
        </div>

        <Field label="Notes" htmlFor="notes">
          <TextArea id="notes" name="notes" rows={2} defaultValue={client?.notes ?? ""} />
        </Field>

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
            {client ? "Save changes" : "Add client"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
