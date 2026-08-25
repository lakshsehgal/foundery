"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { Crown, Trash2, UserPlus } from "lucide-react";
import { addTeamMember, removeTeamMember, type TeamMember } from "@/app/actions/team";
import type { ActionState } from "@/app/actions/clients";
import { Button, Select, TextInput } from "@/components/ui/form";
import { Card, CardTitle, Chip } from "@/components/ui/primitives";

function RemoveButton({ member }: { member: TeamMember }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(removeTeamMember, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action}>
      <input type="hidden" name="id" value={member.id} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Remove ${member.email}`}
        onClick={(event) => {
          if (!window.confirm(`Remove ${member.email}? They won't be able to sign in any more.`)) {
            event.preventDefault();
          }
        }}
        className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-critical)_12%,transparent)] hover:text-[var(--color-critical)] disabled:opacity-50"
      >
        <Trash2 size={13} />
      </button>
    </form>
  );
}

export function TeamCard({
  members, bootstrapFounder,
}: {
  members: TeamMember[];
  /** The env-default founder address that always works, list or no list. */
  bootstrapFounder: string;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(addTeamMember, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <Card>
      <CardTitle
        title="Users & access"
        hint="Who can sign in, and as which of the two roles: founder sees everything including money and analytics; operator runs the day-to-day with values hidden unless you switch them on below. Changes apply on their next sign-in."
      />

      <ul className="mb-4 space-y-1.5">
        <li className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2">
          <Crown size={13} className="shrink-0" style={{ color: "var(--color-warning)" }} />
          <span className="min-w-0 flex-1 truncate text-[13px]">{bootstrapFounder}</span>
          <Chip tone="var(--color-warning)">Founder · built-in</Chip>
        </li>
        {members.map((member) => (
          <li
            key={member.id}
            className="flex items-center gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2"
          >
            <span className="min-w-0 flex-1 truncate text-[13px]">{member.email}</span>
            <Chip tone={member.role === "founder" ? "var(--color-warning)" : "var(--color-series-1)"}>
              {member.role === "founder" ? "Founder" : "Operator"}
            </Chip>
            <RemoveButton member={member} />
          </li>
        ))}
      </ul>

      <form action={action} className="flex flex-wrap items-end gap-2">
        <div className="min-w-[220px] flex-1">
          <TextInput name="email" type="email" placeholder="teammate@neuroidmedia.com" aria-label="Email to add" />
        </div>
        <div className="w-[130px] shrink-0">
          <Select name="role" defaultValue="operator" aria-label="Role">
            <option value="operator">Operator</option>
            <option value="founder">Founder</option>
          </Select>
        </div>
        <Button type="submit" variant="primary" loading={pending} className="shrink-0">
          {!pending && <UserPlus size={14} />}
          Add
        </Button>
      </form>

      <p className="mt-3 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
        The built-in founder address always works, whatever this list says — so you can never lock
        yourself out.
      </p>
    </Card>
  );
}
