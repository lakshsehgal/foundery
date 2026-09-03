"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Target, Trash2, UserPlus } from "lucide-react";
import {
  addMediaBuyer, removeMediaBuyer, type MediaBuyer,
} from "@/app/actions/media-buyers";
import type { ActionState } from "@/app/actions/clients";
import { Button, Select, TextInput } from "@/components/ui/form";
import { Card, CardTitle, Chip } from "@/components/ui/primitives";

function RemoveButton({ buyer }: { buyer: MediaBuyer }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeMediaBuyer, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={buyer.id} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Remove ${buyer.name}`}
        title="Remove — their clients become unassigned"
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-critical)] disabled:opacity-50"
      >
        <Trash2 size={13} />
      </button>
    </form>
  );
}

/**
 * The media-buying bench. Capacity is the honest number per buyer — how many
 * retainer accounts they can run well — and it's what the founder dashboard
 * measures the client load against.
 */
export function MediaBuyersCard({ buyers }: { buyers: MediaBuyer[] }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addMediaBuyer, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardTitle
        title="Media buyers"
        hint="The buying bench. Assign a buyer on each retainer client's card; the founder dashboard reads the load per buyer against the capacity you set here."
      />

      {buyers.length === 0 ? (
        <p className="mb-4 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[12.5px] text-[var(--color-ink-2)]">
          No buyers yet — add the team below, then pick a buyer on each retainer client.
        </p>
      ) : (
        <ul className="mb-4 space-y-1.5">
          {buyers.map((buyer) => (
            <li
              key={buyer.id}
              className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2"
            >
              <Target size={13} className="shrink-0 text-[var(--color-ink-3)]" aria-hidden />
              <span className="min-w-0 flex-1 truncate text-[13px]">{buyer.name}</span>
              <Chip tone="var(--color-series-1)">
                Capacity {buyer.capacity} client{buyer.capacity === 1 ? "" : "s"}
              </Chip>
              <RemoveButton buyer={buyer} />
            </li>
          ))}
        </ul>
      )}

      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[200px] flex-1">
          <TextInput name="name" placeholder="Buyer's name" aria-label="Media buyer name" />
        </div>
        <div className="w-[150px] shrink-0">
          <Select name="capacity" defaultValue="4" aria-label="Capacity">
            {[2, 3, 4, 5, 6, 8, 10].map((n) => (
              <option key={n} value={n}>
                Up to {n} clients
              </option>
            ))}
          </Select>
        </div>
        <Button type="submit" variant="primary" loading={pending} className="shrink-0">
          {!pending && <UserPlus size={14} />}
          Add
        </Button>
      </form>
    </Card>
  );
}
