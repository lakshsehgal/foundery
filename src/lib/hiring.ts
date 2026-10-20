import type { OnboardingField } from "./taxonomy";
import { FIELD_TYPES } from "./taxonomy";

/**
 * Hiring vocabulary and the pure logic behind it. Everything here runs on
 * both sides of the wire — the public application page, the server action
 * that accepts it, and the tests — so nothing in this file touches the
 * database or the session.
 */

export type ApplicantStage = "applied" | "shortlisted" | "interview" | "offer" | "hired" | "rejected";

export const APPLICANT_STAGES: Record<ApplicantStage, { label: string; tone: string }> = {
  applied: { label: "Applied", tone: "var(--color-series-1)" },
  shortlisted: { label: "Shortlisted", tone: "var(--color-accent)" },
  interview: { label: "Interview", tone: "var(--color-warning)" },
  offer: { label: "Offer out", tone: "var(--color-series-2)" },
  hired: { label: "Hired", tone: "var(--color-good)" },
  rejected: { label: "Passed", tone: "var(--color-ink-3)" },
};

export function isApplicantStage(value: string): value is ApplicantStage {
  return value in APPLICANT_STAGES;
}

/**
 * The office is in Ghitorni, so Delhi is non-negotiable — the question is
 * asked outright and the answer rides on every applicant row, filterable.
 * "No" is still accepted: an honest no beats a lie that surfaces at the
 * interview, and the row wears a red chip instead.
 */
export type Relocation = "delhi" | "relocate" | "no";

export const RELOCATION: Record<Relocation, { label: string; short: string; tone: string }> = {
  delhi: { label: "I'm based in Delhi NCR", short: "In Delhi", tone: "var(--color-good)" },
  relocate: { label: "I can relocate to Delhi", short: "Will relocate", tone: "var(--color-series-1)" },
  no: { label: "Neither, but I'm applying anyway", short: "Not in Delhi", tone: "var(--color-critical)" },
};

export function isRelocation(value: string): value is Relocation {
  return value in RELOCATION;
}

export type Employment = "full_time" | "part_time" | "internship" | "contract";

export const EMPLOYMENT: Record<Employment, string> = {
  full_time: "Full-time",
  part_time: "Part-time",
  internship: "Internship",
  contract: "Contract",
};

export function isEmployment(value: string): value is Employment {
  return value in EMPLOYMENT;
}

export const DEFAULT_LOCATION = "Ghitorni, New Delhi — on-site";

/**
 * What every candidate gives regardless of role, coded here rather than in
 * each role's jsonb so the applicants table always has real columns to sort
 * and filter on. Role-specific questions start after these.
 */
export const BASE_APPLICANT_FIELDS = [
  { key: "name", label: "Full name", type: "text", required: true },
  { key: "email", label: "Email", type: "email", required: true },
  { key: "phone", label: "Phone number", type: "text", required: true, hint: "WhatsApp-reachable, ideally." },
  { key: "city", label: "Current city", type: "text", required: true },
  { key: "resume_url", label: "Resume / portfolio link", type: "url", required: false, hint: "A Drive, LinkedIn or portfolio link — anything that shows your work." },
] as const;

/**
 * Collects a submission's answers against the questions a role actually
 * declares — unknown keys are dropped rather than stored, required gaps stop
 * the submission, and everything is length-capped. Pure, so the tests can
 * throw hostile input at it without a database.
 */
export function collectAnswers(
  fields: OnboardingField[],
  get: (key: string) => string,
): { answers: Record<string, string>; error?: string } {
  const answers: Record<string, string> = {};
  for (const field of fields) {
    const value = get(`q_${field.key}`).trim();
    if (field.required && !value) {
      return { answers: {}, error: `“${field.label}” is needed before you can send this.` };
    }
    if (value) answers[field.key] = value.slice(0, 4000);
  }
  return { answers };
}

/**
 * Turns the role editor's repeated form rows into question definitions.
 * Keys derive from the label so nobody thinks about them, de-duplicated so
 * two questions can't overwrite each other's answers. Same contract as the
 * onboarding form builder, shared here so both sides stay testable.
 */
export function fieldsFromRows(rows: {
  labels: string[]; types: string[]; required: string[]; hints: string[];
}): OnboardingField[] {
  const seen = new Set<string>();
  const out: OnboardingField[] = [];

  rows.labels.forEach((label, index) => {
    const trimmed = label.trim();
    if (!trimmed) return;
    const base =
      trimmed.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40) ||
      "question";
    let key = base;
    let n = 2;
    while (seen.has(key)) key = `${base}_${n++}`;
    seen.add(key);

    const type = FIELD_TYPES.includes(rows.types[index] as (typeof FIELD_TYPES)[number])
      ? (rows.types[index] as OnboardingField["type"])
      : "text";

    out.push({
      key,
      label: trimmed,
      type,
      required: rows.required[index] === "1",
      hint: (rows.hints[index] ?? "").trim() || undefined,
    });
  });

  return out;
}

/* ---------------------------------------------------------- starter roles */

export type StarterRole = {
  slug: string;
  title: string;
  pitch: string;
  fields: OnboardingField[];
};

const ASK_SALARY: OnboardingField = {
  key: "expected_salary", label: "Current / expected monthly salary", type: "text", required: true,
  hint: "A number or a range — whatever's honest.",
};
const ASK_START: OnboardingField = {
  key: "start_date", label: "How soon can you start?", type: "text", required: true,
  hint: "Notice period, exams, anything that sets the date.",
};

/**
 * The four roles Neuroid opens with. Created once (with fresh tokens) when
 * the hiring section first loads against an empty table; after that they're
 * ordinary editable roles like any the founder adds.
 */
export const STARTER_ROLES: StarterRole[] = [
  {
    slug: "founders-office-associate",
    title: "Founder's Office Associate",
    pitch:
      "Work directly with the founder across everything Neuroid runs — client strategy, numbers, hiring, new bets. You'll own research, follow-ups and special projects end-to-end. The steepest learning curve in the company, for someone who wants to build their own thing someday.",
    fields: [
      { key: "why_founders_office", label: "Why a founder's office, and why Neuroid?", type: "textarea", required: true },
      { key: "ownership_story", label: "Tell us about something you drove end-to-end — start to finish.", type: "textarea", required: true, hint: "College fest, side project, a mess you cleaned up at work — anything real." },
      { key: "current_status", label: "What are you doing right now (work or college)?", type: "text", required: true },
      { key: "linkedin", label: "LinkedIn profile", type: "url", required: false },
      ASK_SALARY,
      ASK_START,
    ],
  },
  {
    slug: "hr-executive",
    title: "HR Executive",
    pitch:
      "Own hiring and people ops for a fast-growing D2C marketing agency — sourcing, interviews, offers, onboarding, payroll coordination and keeping a young team running well. You'll build the HR function, not inherit one.",
    fields: [
      { key: "hr_experience", label: "Years of experience in HR or recruiting", type: "text", required: true },
      { key: "hiring_process", label: "Walk us through how you'd hire for a role — sourcing to offer.", type: "textarea", required: true },
      { key: "tools", label: "Tools you've used (job boards, ATS, payroll)", type: "text", required: false },
      ASK_SALARY,
      ASK_START,
    ],
  },
  {
    slug: "content-associate",
    title: "Content Associate",
    pitch:
      "Help make content that sells — reels, scripts, shoots and edits for Neuroid's own brand and the D2C brands we run ads for. You'll work directly on the founder's content pipeline, from hook to posted.",
    fields: [
      { key: "work_links", label: "Links to content you've made", type: "textarea", required: true, hint: "Profiles, reels, edits, scripts — paste the links, one per line." },
      { key: "skills", label: "Scripting, shooting, editing — which parts do you do, and with what tools?", type: "textarea", required: true },
      { key: "taste", label: "Which creators or brands do content right, and why?", type: "textarea", required: false },
      ASK_SALARY,
      ASK_START,
    ],
  },
  {
    slug: "operations-admin-executive",
    title: "Operations & Admin Executive",
    pitch:
      "Keep the agency's day-to-day running — operations, admin, billing follow-ups, agreements and vendor coordination. The person who makes sure nothing slips, so the rest of the team can stay on client work.",
    fields: [
      { key: "billing_experience", label: "Your experience with billing, invoicing or payment follow-ups", type: "textarea", required: true },
      { key: "admin_experience", label: "Have you handled agreements, vendors or office admin before? Tell us where.", type: "textarea", required: true },
      { key: "spreadsheets", label: "How comfortable are you with spreadsheets?", type: "text", required: true, hint: "Be honest — this role lives in them." },
      ASK_SALARY,
      ASK_START,
    ],
  },
];
