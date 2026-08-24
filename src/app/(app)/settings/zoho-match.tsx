"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Link2 } from "lucide-react";
import { mapZohoCustomerAction } from "@/app/actions/zoho";
import type { ActionState } from "@/app/actions/clients";
import { Select } from "@/components/ui/form";
import { Card, CardTitle, Chip } from "@/components/ui/primitives";
import { ZohoSyncButton } from "@/app/(app)/invoices/zoho-sync-button";

export type MatchCustomer = {
  name: string;
  invoiceCount: number;
  /** Pre-formatted on the server. */
  outstandingLabel: string;
  hasOutstanding: boolean;
  /** The client currently mapped to this customer, if any. */
  mappedClientId: number | null;
};

function Row({
  customer, clients,
}: {
  customer: MatchCustomer;
  clients: { id: number; name: string }[];
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(mapZohoCustomerAction, {});
  const [selected, setSelected] = useState(customer.mappedClientId ?? 0);

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form
      action={action}
      className="flex flex-wrap items-center gap-2 border-b border-[var(--color-line)] py-2 last:border-b-0"
    >
      <input type="hidden" name="zoho_name" value={customer.name} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[12.5px] font-medium">{customer.name}</p>
        <p className="text-[10.5px] text-[var(--color-ink-3)]">
          {customer.invoiceCount} invoice{customer.invoiceCount === 1 ? "" : "s"}
          {customer.hasOutstanding ? ` · ${customer.outstandingLabel} due` : ""}
        </p>
      </div>
      <div className="w-[190px] shrink-0">
        <Select
          name="client_id"
          value={selected}
          onChange={(event) => setSelected(Number(event.target.value))}
          aria-label={`Client for ${customer.name}`}
        >
          <option value={0}>Not a client</option>
          {clients.map((client) => (
            <option key={client.id} value={client.id}>
              {client.name}
            </option>
          ))}
        </Select>
      </div>
      <button
        type="submit"
        disabled={pending || selected === (customer.mappedClientId ?? 0)}
        className="inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-sm)] border border-[var(--color-line-strong)] px-2.5 py-1.5 text-[12px] font-medium transition-colors hover:bg-[var(--color-surface-2)] disabled:opacity-40"
      >
        {customer.mappedClientId && selected === customer.mappedClientId ? (
          <>
            <Check size={12} style={{ color: "var(--color-good)" }} />
            Matched
          </>
        ) : (
          <>
            <Link2 size={12} />
            Save
          </>
        )}
      </button>
    </form>
  );
}

export function ZohoMatchCard({
  customers, clients, fetchError,
}: {
  customers: MatchCustomer[];
  clients: { id: number; name: string }[];
  fetchError: string | null;
}) {
  const [showAll, setShowAll] = useState(false);
  const matchedCount = customers.filter((customer) => customer.mappedClientId).length;
  const interesting = customers.filter(
    (customer) => customer.mappedClientId || customer.hasOutstanding,
  );
  const shown = showAll ? customers : interesting;

  return (
    <Card>
      <CardTitle
        title="Match Zoho customers to clients"
        hint="Pick the client each Zoho customer belongs to and save — their whole invoice history syncs on the next pull. Customers left as “Not a client” are simply ignored."
      >
        <Chip tone={matchedCount > 0 ? "var(--color-good)" : "var(--color-ink-3)"} size="md">
          {matchedCount}/{customers.length} matched
        </Chip>
      </CardTitle>

      {fetchError ? (
        <p className="text-[12.5px] text-[var(--color-critical)]">{fetchError}</p>
      ) : customers.length === 0 ? (
        <p className="text-[12.5px] text-[var(--color-ink-3)]">No customers found in Zoho.</p>
      ) : (
        <>
          <div className="max-h-[420px] overflow-y-auto pr-1">
            {shown.map((customer) => (
              <Row key={customer.name} customer={customer} clients={clients} />
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            {interesting.length < customers.length && (
              <button
                onClick={() => setShowAll((value) => !value)}
                className="text-[12px] font-medium text-[var(--color-ink-2)] underline underline-offset-4"
              >
                {showAll
                  ? "Show only customers with dues"
                  : `Show all ${customers.length} customers (incl. fully paid)`}
              </button>
            )}
            <span className="ml-auto" />
            <ZohoSyncButton />
          </div>
        </>
      )}
    </Card>
  );
}
