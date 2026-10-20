"use client";

import { useActionState, useEffect, useState } from "react";
import { toast } from "sonner";
import { GripVertical, Plus, Trash2 } from "lucide-react";
import { saveJobRole } from "@/app/actions/hiring";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { FIELD_TYPES, type OnboardingField } from "@/lib/taxonomy";
import { DEFAULT_LOCATION, EMPLOYMENT, type Employment } from "@/lib/hiring";
import type { JobRoleView } from "@/lib/queries";

const TYPE_LABEL: Record<string, string> = {
  text: "Short answer",
  textarea: "Long answer",
  email: "Email",
  url: "Link",
  number: "Number",
};

type Draft = OnboardingField & { uid: string };

let counter = 0;
function withUid(field: OnboardingField): Draft {
  return { ...field, uid: `q${counter++}` };
}

const STARTER_QUESTIONS: OnboardingField[] = [
  { key: "", label: "Why this role, and why Neuroid?", type: "textarea", required: true },
  { key: "", label: "Current / expected monthly salary", type: "text", required: true },
  { key: "", label: "How soon can you start?", type: "text", required: true },
];

/**
 * Where a role and its public application page get composed. Every question
 * added here is a question candidates answer on /apply/<token> — the fixed
 * who-are-you block (name, email, phone, city, the Delhi question) is always
 * asked and never needs adding.
 */
export function RoleEditor({
  open, onClose, role,
}: {
  open: boolean;
  onClose: () => void;
  role: JobRoleView | null;
}) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveJobRole, {});
  const [fields, setFields] = useState<Draft[]>(() =>
    (role?.fields ?? STARTER_QUESTIONS).map(withUid),
  );

  useEffect(() => {
    if (state.ok) {
      toast.success(state.ok);
      onClose();
    }
  }, [state, onClose]);

  function update(uid: string, patch: Partial<Draft>) {
    setFields((current) => current.map((field) => (field.uid === uid ? { ...field, ...patch } : field)));
  }

  function move(index: number, by: number) {
    setFields((current) => {
      const next = [...current];
      const target = index + by;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={role ? `Edit “${role.title}”` : "Open a new role"}
      description="Candidates see all of this on a public Neuroid-branded page — no sign-in, no account. Name, email, phone, city and the Delhi question are always asked; add only the role-specific questions."
      width={720}
    >
      <form action={action} className="space-y-4">
        {role && <input type="hidden" name="id" value={role.id} />}

        <div className="grid gap-4 sm:grid-cols-[1fr_150px]">
          <Field label="Role title" htmlFor="title" hint="The headline on their page.">
            <TextInput id="title" name="title" defaultValue={role?.title ?? ""} required autoFocus />
          </Field>
          <Field label="Type" htmlFor="employment">
            <Select id="employment" name="employment" defaultValue={role?.employment ?? "full_time"}>
              {(Object.keys(EMPLOYMENT) as Employment[]).map((key) => (
                <option key={key} value={key}>
                  {EMPLOYMENT[key]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <Field
          label="The pitch"
          htmlFor="pitch"
          hint="Two or three sentences on why the role is worth their time. Shown under the title."
        >
          <TextArea id="pitch" name="pitch" rows={3} defaultValue={role?.pitch ?? ""} />
        </Field>

        <Field label="Location line" htmlFor="location" hint="Shown next to the role type.">
          <TextInput id="location" name="location" defaultValue={role?.location ?? DEFAULT_LOCATION} />
        </Field>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[12px] font-medium text-[var(--color-ink-2)]">
              Role-specific questions <span className="text-[var(--color-ink-3)]">({fields.length})</span>
            </p>
            <Button
              type="button"
              size="sm"
              onClick={() =>
                setFields((current) => [
                  ...current,
                  withUid({ key: "", label: "", type: "text", required: false }),
                ])
              }
            >
              <Plus size={13} />
              Add question
            </Button>
          </div>

          <div className="max-h-[34vh] space-y-2 overflow-y-auto rounded-[var(--radius-md)] border border-[var(--color-line)] p-2">
            {fields.length === 0 && (
              <p className="px-2 py-6 text-center text-[12.5px] text-[var(--color-ink-3)]">
                No questions yet. Add one — a role with none screens nobody.
              </p>
            )}

            {fields.map((field, index) => (
              <div
                key={field.uid}
                className="rounded-[var(--radius-sm)] bg-[var(--color-surface-2)] p-2.5"
              >
                <div className="flex items-start gap-2">
                  <div className="mt-1 flex shrink-0 flex-col text-[var(--color-ink-3)]">
                    <button
                      type="button"
                      onClick={() => move(index, -1)}
                      disabled={index === 0}
                      aria-label="Move question up"
                      className="text-[10px] leading-none disabled:opacity-30"
                    >
                      ▲
                    </button>
                    <GripVertical size={12} aria-hidden className="my-0.5" />
                    <button
                      type="button"
                      onClick={() => move(index, 1)}
                      disabled={index === fields.length - 1}
                      aria-label="Move question down"
                      className="text-[10px] leading-none disabled:opacity-30"
                    >
                      ▼
                    </button>
                  </div>

                  <div className="grid min-w-0 flex-1 gap-2 sm:grid-cols-[1fr_140px]">
                    <TextInput
                      name="field_label"
                      value={field.label}
                      onChange={(event) => update(field.uid, { label: event.target.value })}
                      placeholder="What are you asking?"
                      aria-label={`Question ${index + 1}`}
                    />
                    <Select
                      name="field_type"
                      value={field.type}
                      onChange={(event) =>
                        update(field.uid, { type: event.target.value as OnboardingField["type"] })
                      }
                      aria-label={`Answer type for question ${index + 1}`}
                    >
                      {FIELD_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {TYPE_LABEL[type]}
                        </option>
                      ))}
                    </Select>
                    <TextInput
                      name="field_hint"
                      value={field.hint ?? ""}
                      onChange={(event) => update(field.uid, { hint: event.target.value })}
                      placeholder="Helper text (optional)"
                      aria-label={`Hint for question ${index + 1}`}
                      className="sm:col-span-2"
                    />
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <label className="flex cursor-pointer items-center gap-1 text-[11.5px] text-[var(--color-ink-2)]">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) => update(field.uid, { required: event.target.checked })}
                        className="h-3.5 w-3.5 accent-[var(--color-accent)]"
                      />
                      Required
                    </label>
                    <input type="hidden" name="field_required" value={field.required ? "1" : "0"} />
                    <button
                      type="button"
                      onClick={() => setFields((current) => current.filter((f) => f.uid !== field.uid))}
                      aria-label={`Remove question ${index + 1}`}
                      className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[color-mix(in_srgb,var(--color-critical)_12%,transparent)] hover:text-[var(--color-critical)]"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <label className="flex cursor-pointer items-start gap-2.5 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5">
          <input
            type="checkbox"
            name="status"
            value="closed"
            defaultChecked={role?.status === "closed"}
            className="mt-[3px] h-3.5 w-3.5 shrink-0 accent-[var(--color-accent)]"
          />
          <span className="min-w-0">
            <span className="block text-[13px] font-medium">Closed to new applications</span>
            <span className="block text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
              The link keeps working but shows a &ldquo;role closed&rdquo; note instead of the form.
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
            {role ? "Save role" : "Open role"}
          </Button>
        </DialogFooter>
      </form>
    </Dialog>
  );
}
