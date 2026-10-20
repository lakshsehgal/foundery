"use client";

import { useActionState, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Check, Copy, ExternalLink, Pencil, Plus, Search, Trash2, UserRound, UsersRound,
} from "lucide-react";
import { deleteApplicant, saveApplicantNotes, setApplicantStage } from "@/app/actions/hiring";
import type { ActionState } from "@/app/actions/clients";
import { Button, Field, Select, TextArea, TextInput } from "@/components/ui/form";
import { Dialog, DialogFooter } from "@/components/ui/dialog";
import { avatarTint, Chip, EmptyState, TableWrap, Td, Th } from "@/components/ui/primitives";
import {
  APPLICANT_STAGES, EMPLOYMENT, RELOCATION, type ApplicantStage,
} from "@/lib/hiring";
import type { JobApplicantView, JobRoleView } from "@/lib/queries";
import { prettyDate } from "@/lib/dates";
import { RoleEditor } from "./role-editor";

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  async function copy(event: React.MouseEvent) {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      toast.success("Application link copied — share it anywhere.");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy automatically — open the page and copy the address.");
    }
  }

  return (
    <button
      onClick={copy}
      title="Copy the public application link"
      className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
      Copy link
    </button>
  );
}

/** The stage mover: one form, six submit buttons, the active one filled in. */
function StageButtons({ applicant }: { applicant: JobApplicantView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(setApplicantStage, {});

  useEffect(() => {
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="flex flex-wrap gap-1.5">
      <input type="hidden" name="id" value={applicant.id} />
      {(Object.keys(APPLICANT_STAGES) as ApplicantStage[]).map((stage) => {
        const active = applicant.stage === stage;
        return (
          <button
            key={stage}
            type="submit"
            name="stage"
            value={stage}
            disabled={pending || active}
            className="rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:cursor-default"
            style={
              active
                ? {
                    background: `color-mix(in srgb, ${APPLICANT_STAGES[stage].tone} 18%, transparent)`,
                    borderColor: "transparent",
                    color: APPLICANT_STAGES[stage].tone,
                  }
                : { borderColor: "var(--color-line-strong)", color: "var(--color-ink-3)" }
            }
          >
            {APPLICANT_STAGES[stage].label}
          </button>
        );
      })}
    </form>
  );
}

function NotesForm({ applicant }: { applicant: JobApplicantView }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(saveApplicantNotes, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  return (
    <form action={action} className="space-y-2">
      <input type="hidden" name="id" value={applicant.id} />
      <Field label="Your notes" htmlFor="notes" hint="Interview impressions, references, the call you're leaning towards. The candidate never sees this.">
        <TextArea id="notes" name="notes" rows={3} defaultValue={applicant.notes ?? ""} />
      </Field>
      <Button type="submit" size="sm" loading={pending}>
        Save notes
      </Button>
    </form>
  );
}

function DeleteApplicantButton({ id }: { id: number }) {
  const [state, action, pending] = useActionState<ActionState, FormData>(deleteApplicant, {});
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (state.ok) toast.success(state.ok);
    if (state.error) toast.error(state.error);
  }, [state]);

  if (!armed) {
    return (
      <Button type="button" variant="ghost" onClick={() => setArmed(true)}>
        <Trash2 size={13} />
        Remove
      </Button>
    );
  }

  return (
    <form action={action}>
      <input type="hidden" name="id" value={id} />
      <Button type="submit" variant="danger" loading={pending}>
        Yes, remove for good
      </Button>
    </form>
  );
}

export function HiringView({
  roles, applicants, links, isFounder,
}: {
  roles: JobRoleView[];
  applicants: JobApplicantView[];
  /** role id → the public application URL, built on the server. */
  links: Record<number, string>;
  isFounder: boolean;
}) {
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<JobRoleView | null>(null);
  const [openedAt, setOpenedAt] = useState(0);

  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [viewerOpenedAt, setViewerOpenedAt] = useState(0);

  const [query, setQuery] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [stageFilter, setStageFilter] = useState("all");

  function editRole(role: JobRoleView | null) {
    setEditingRole(role);
    setEditorOpen(true);
    setOpenedAt((n) => n + 1);
  }

  function viewApplicant(id: number) {
    setSelectedId(id);
    setViewerOpenedAt((n) => n + 1);
  }

  // Derived from props so a stage change or note save (which refreshes the
  // server data) updates the open dialog instead of showing a stale copy.
  const selected = applicants.find((applicant) => applicant.id === selectedId) ?? null;
  const selectedRole = selected ? roles.find((role) => role.id === selected.role_id) : null;

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return applicants.filter((applicant) => {
      if (roleFilter !== "all" && String(applicant.role_id) !== roleFilter) return false;
      if (stageFilter === "live") {
        if (applicant.stage === "hired" || applicant.stage === "rejected") return false;
      } else if (stageFilter !== "all" && applicant.stage !== stageFilter) {
        return false;
      }
      if (!needle) return true;
      return (
        applicant.name.toLowerCase().includes(needle) ||
        applicant.email.toLowerCase().includes(needle) ||
        (applicant.city ?? "").toLowerCase().includes(needle)
      );
    });
  }, [applicants, query, roleFilter, stageFilter]);

  const countsByRole = useMemo(() => {
    const counts: Record<number, { total: number; fresh: number }> = {};
    for (const applicant of applicants) {
      const entry = (counts[applicant.role_id] ??= { total: 0, fresh: 0 });
      entry.total += 1;
      if (applicant.stage === "applied") entry.fresh += 1;
    }
    return counts;
  }, [applicants]);

  return (
    <>
      {/* ------------------------------------------------------------ roles */}
      <section>
        <div className="mb-2.5 flex items-center justify-between gap-2">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-[13.5px] font-bold">Roles</h2>
            <span className="text-[11.5px] text-[var(--color-ink-3)]">
              Each one is a public, Neuroid-branded application page — share the link anywhere.
            </span>
          </div>
          <Button variant="primary" onClick={() => editRole(null)} className="shrink-0">
            <Plus size={14} />
            New role
          </Button>
        </div>

        {roles.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            <EmptyState
              icon={<UsersRound size={22} />}
              title="No roles yet"
              hint="Open one and you'll get a public application link to share. If you've just set up the database, reload once — the starter roles create themselves."
              action={
                <Button variant="primary" onClick={() => editRole(null)}>
                  <Plus size={14} />
                  Open a role
                </Button>
              }
            />
          </div>
        ) : (
          <div className="stagger grid gap-3 sm:grid-cols-2">
            {roles.map((role) => {
              const tone = avatarTint(`role-${role.id}`);
              const counts = countsByRole[role.id];
              return (
                <div
                  key={role.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => editRole(role)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      editRole(role);
                    }
                  }}
                  className="lift group cursor-pointer overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] text-left"
                >
                  <div aria-hidden className="h-1.5 w-full" style={{ background: tone }} />
                  <div className="p-4">
                    <div className="flex min-w-0 items-center gap-2">
                      <span className="min-w-0 truncate text-[15px] font-bold tracking-tight">
                        {role.title}
                      </span>
                      <Pencil
                        size={11}
                        aria-hidden
                        className="shrink-0 text-[var(--color-ink-3)] opacity-0 transition-opacity group-hover:opacity-100"
                      />
                      <span className="ml-auto shrink-0">
                        <Chip tone={role.status === "open" ? "var(--color-good)" : "var(--color-ink-3)"}>
                          {role.status === "open" ? "Open" : "Closed"}
                        </Chip>
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11.5px] text-[var(--color-ink-3)]">
                      {EMPLOYMENT[role.employment]} · {role.location}
                    </p>

                    <p className="mt-3 text-[12.5px] text-[var(--color-ink-2)]">
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          setRoleFilter(String(role.id));
                        }}
                        className="font-semibold underline-offset-2 hover:underline"
                        title="Show this role's applicants below"
                      >
                        {counts?.total ?? 0} applicant{(counts?.total ?? 0) === 1 ? "" : "s"}
                      </button>
                      {counts && counts.fresh > 0 && (
                        <span className="text-[var(--color-ink-3)]"> · {counts.fresh} unreviewed</span>
                      )}
                    </p>

                    <div
                      className="mt-3 -mx-1 flex flex-wrap items-center gap-1 border-t border-[var(--color-line)] pt-2.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <CopyLinkButton url={links[role.id] ?? ""} />
                      <a
                        href={links[role.id] ?? "#"}
                        target="_blank"
                        rel="noreferrer"
                        title="Open the public application page"
                        className="inline-flex items-center gap-1.5 rounded-[var(--radius-sm)] px-2 py-1 text-[11.5px] font-semibold text-[var(--color-ink-2)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                      >
                        <ExternalLink size={12} />
                        Preview page
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ------------------------------------------------------- applicants */}
      <section>
        <div className="mb-2.5 flex items-baseline gap-2.5">
          <h2 className="text-[13.5px] font-bold">Applicants</h2>
          <span className="tabular text-[12px] font-semibold text-[var(--color-ink-3)]">
            {filtered.length}
          </span>
          <span className="text-[11.5px] text-[var(--color-ink-3)]">
            Everyone who&apos;s applied, across every role.
          </span>
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="relative min-w-[180px] flex-1">
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-ink-3)]"
            />
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, email or city"
              aria-label="Search applicants"
              className="pl-8"
            />
          </div>
          <div className="w-[200px] shrink-0">
            <Select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              aria-label="Filter by role"
            >
              <option value="all">All roles</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.title}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-[160px] shrink-0">
            <Select
              value={stageFilter}
              onChange={(event) => setStageFilter(event.target.value)}
              aria-label="Filter by stage"
            >
              <option value="all">All stages</option>
              <option value="live">Still in play</option>
              {(Object.keys(APPLICANT_STAGES) as ApplicantStage[]).map((stage) => (
                <option key={stage} value={stage}>
                  {APPLICANT_STAGES[stage].label}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            <EmptyState
              icon={<UserRound size={22} />}
              title={applicants.length === 0 ? "No applications yet" : "Nothing matches that"}
              hint={
                applicants.length === 0
                  ? "Share a role's link — every application lands here the moment it's sent."
                  : "Try a different search, or widen the filters."
              }
            />
          </div>
        ) : (
          <div className="overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)]">
            <TableWrap>
              <thead>
                <tr>
                  <Th>Applicant</Th>
                  <Th>Role</Th>
                  <Th>City</Th>
                  <Th>Delhi?</Th>
                  <Th>Stage</Th>
                  <Th align="right">Applied</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((applicant) => (
                  <tr
                    key={applicant.id}
                    tabIndex={0}
                    onClick={() => viewApplicant(applicant.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        viewApplicant(applicant.id);
                      }
                    }}
                    className="cursor-pointer transition-colors hover:bg-[var(--color-surface-2)] focus-visible:bg-[var(--color-surface-2)]"
                  >
                    <Td>
                      <span className="block truncate font-semibold">{applicant.name}</span>
                      <span className="block truncate text-[11px] text-[var(--color-ink-3)]">
                        {applicant.email}
                      </span>
                    </Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-[var(--color-ink-2)]">
                      {applicant.role_title}
                    </Td>
                    <Td className="whitespace-nowrap text-[12.5px] text-[var(--color-ink-2)]">
                      {applicant.city ?? "—"}
                    </Td>
                    <Td>
                      <Chip tone={RELOCATION[applicant.relocation].tone}>
                        {RELOCATION[applicant.relocation].short}
                      </Chip>
                    </Td>
                    <Td>
                      <Chip tone={APPLICANT_STAGES[applicant.stage].tone}>
                        {APPLICANT_STAGES[applicant.stage].label}
                      </Chip>
                    </Td>
                    <Td align="right" className="tabular whitespace-nowrap text-[12.5px] text-[var(--color-ink-2)]">
                      {prettyDate(applicant.created_at)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </TableWrap>
          </div>
        )}
      </section>

      {/* ------------------------------------------------- applicant viewer */}
      <Dialog
        open={selected !== null}
        onClose={() => setSelectedId(null)}
        title={selected?.name ?? ""}
        description={
          selected ? `${selected.role_title} · applied ${prettyDate(selected.created_at)}` : undefined
        }
        width={640}
      >
        {selected && (
          <div key={`${selected.id}-${viewerOpenedAt}`} className="space-y-5">
            <div className="grid gap-x-6 gap-y-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] p-3.5 text-[13px] sm:grid-cols-2">
              <p className="min-w-0">
                <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">Email</span>
                <a href={`mailto:${selected.email}`} className="break-all font-medium underline-offset-2 hover:underline">
                  {selected.email}
                </a>
              </p>
              <p className="min-w-0">
                <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">Phone</span>
                <span className="font-medium">{selected.phone ?? "—"}</span>
              </p>
              <p className="min-w-0">
                <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">City</span>
                <span className="font-medium">{selected.city ?? "—"}</span>{" "}
                <Chip tone={RELOCATION[selected.relocation].tone}>
                  {RELOCATION[selected.relocation].short}
                </Chip>
              </p>
              <p className="min-w-0">
                <span className="block text-[10.5px] font-medium uppercase tracking-[0.08em] text-[var(--color-ink-3)]">Resume / portfolio</span>
                {selected.resume_url ? (
                  <a
                    href={selected.resume_url}
                    target="_blank"
                    rel="noreferrer"
                    className="break-all font-medium underline-offset-2 hover:underline"
                  >
                    {selected.resume_url}
                  </a>
                ) : (
                  <span className="font-medium">—</span>
                )}
              </p>
            </div>

            <div>
              <p className="mb-1.5 text-[12px] font-medium text-[var(--color-ink-2)]">Stage</p>
              <StageButtons applicant={selected} />
            </div>

            {(selectedRole?.fields ?? []).some((field) => selected.answers[field.key]) && (
              <div className="space-y-3.5">
                <p className="text-[12px] font-medium text-[var(--color-ink-2)]">Their answers</p>
                {(selectedRole?.fields ?? [])
                  .filter((field) => selected.answers[field.key])
                  .map((field) => (
                    <div key={field.key}>
                      <p className="text-[11.5px] font-semibold text-[var(--color-ink-3)]">
                        {field.label}
                      </p>
                      <p className="mt-0.5 whitespace-pre-wrap text-[13px] leading-relaxed">
                        {selected.answers[field.key]}
                      </p>
                    </div>
                  ))}
              </div>
            )}

            <NotesForm applicant={selected} />

            {isFounder && (
              <DialogFooter>
                <DeleteApplicantButton id={selected.id} />
              </DialogFooter>
            )}
          </div>
        )}
      </Dialog>

      <RoleEditor
        key={`${editingRole?.id ?? "new"}-${openedAt}`}
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        role={editingRole}
      />
    </>
  );
}
