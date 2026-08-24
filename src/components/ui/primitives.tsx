import { Lock } from "lucide-react";

/* ---------------------------------------------------------------- Layout */

export function PageHeader({
  title, subtitle, children,
}: {
  title: string; subtitle?: string; children?: React.ReactNode;
}) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-4 border-b border-[var(--color-line)] bg-[var(--color-surface)] px-5 print:hidden">
      <div className="min-w-0">
        <h1 className="truncate text-[15.5px] font-semibold">{title}</h1>
        {subtitle && (
          <p className="truncate text-[11.5px] leading-tight text-[var(--color-ink-3)]">{subtitle}</p>
        )}
      </div>
      <div className="ml-auto flex items-center gap-2">{children}</div>
    </header>
  );
}

export function Card({
  children, className = "", padded = true,
}: {
  children: React.ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section
      className={`rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] ${
        padded ? "p-4" : ""
      } ${className}`}
    >
      {children}
    </section>
  );
}

export function EmptyState({
  icon, title, hint, action,
}: {
  icon?: React.ReactNode; title: string; hint?: string; action?: React.ReactNode;
}) {
  return (
    <div className="grid place-items-center px-6 py-14 text-center">
      {icon && (
        <div
          className="pop mb-4 grid h-14 w-14 place-items-center rounded-full text-[var(--color-brand-ink)]"
          style={{ background: "var(--color-brand)" }}
        >
          {icon}
        </div>
      )}
      <p className="text-[14px] font-medium">{title}</p>
      {hint && <p className="mt-1 max-w-xs text-[12.5px] leading-relaxed text-[var(--color-ink-3)]">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- People */

/** Deterministic tint so a person keeps one colour everywhere in the app. */
export function avatarTint(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  const slots = [
    "var(--color-series-1)", "var(--color-series-2)", "var(--color-series-3)",
    "var(--color-series-5)", "var(--color-series-6)",
  ];
  return slots[hash % slots.length];
}

export function initials(name: string, email?: string): string {
  const source = name?.trim() || email?.split("@")[0] || "?";
  const parts = source.replace(/[^\p{L}\s.]/gu, " ").split(/[\s.]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  id, name, email, size = 24, title, src,
}: {
  id: string; name: string; email?: string;
  size?: number; title?: string; src?: string | null;
}) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src} alt="" title={title ?? name ?? email}
        width={size} height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      title={title ?? name ?? email}
      className="grid shrink-0 place-items-center rounded-full font-semibold text-white"
      style={{
        background: avatarTint(id),
        width: size, height: size,
        fontSize: Math.max(9, Math.round(size * 0.4)),
      }}
    >
      {initials(name, email)}
    </span>
  );
}

export function AvatarStack({
  people, max = 4, size = 22,
}: {
  people: { id: string; full_name: string; email?: string }[];
  max?: number; size?: number;
}) {
  const shown = people.slice(0, max);
  const rest = people.length - shown.length;
  return (
    <div className="flex items-center">
      {shown.map((person, index) => (
        <span
          key={person.id}
          style={{ marginLeft: index === 0 ? 0 : -6, zIndex: shown.length - index }}
          className="rounded-full ring-2 ring-[var(--color-surface)]"
        >
          <Avatar id={person.id} name={person.full_name} email={person.email} size={size} />
        </span>
      ))}
      {rest > 0 && (
        <span
          className="ml-[-6px] grid place-items-center rounded-full bg-[var(--color-surface-3)] text-[10px] font-medium text-[var(--color-ink-2)] ring-2 ring-[var(--color-surface)]"
          style={{ width: size, height: size }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}

/* ----------------------------------------------------------------- Chips */

/**
 * A tinted chip. `tone` is any token — a series colour for a category, a
 * status colour for a state. 16% of the tone as a background against the
 * tone as text is the ratio that stays legible in both themes.
 */
export function Chip({
  tone, children, size = "sm", title,
}: {
  tone: string; children: React.ReactNode; size?: "sm" | "md"; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex shrink-0 items-center gap-1 rounded-[var(--radius-xs)] font-medium ${
        size === "sm" ? "px-1.5 py-0.5 text-[10.5px]" : "px-2 py-1 text-[12px]"
      }`}
      style={{ background: `color-mix(in srgb, ${tone} 16%, transparent)`, color: tone }}
    >
      {children}
    </span>
  );
}

/** A solid pill for the one state that should shout. Live = breathing dot. */
export function Pill({
  fill, children, live, size = "sm", title,
}: {
  fill: string; children: React.ReactNode; live?: boolean;
  size?: "sm" | "md"; title?: string;
}) {
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 rounded-full font-semibold text-white ${
        size === "sm" ? "px-2.5 py-[3px] text-[11px]" : "px-3 py-1 text-[12.5px]"
      }`}
      style={{ background: fill }}
    >
      {live && <span className="breathe h-1.5 w-1.5 rounded-full bg-white/90" aria-hidden />}
      {children}
    </span>
  );
}

/* ----------------------------------------------------------------- Stats */

/**
 * A headline number. `deltaGood` says which direction is the good one —
 * for minutes-per-unit, down is up.
 */
export function StatTile({
  label, value, unit, delta, deltaGood, hint, accent, swatch, tone, count,
}: {
  label: string; value?: string | number; unit?: string;
  delta?: number | null; deltaGood?: "up" | "down";
  hint?: string; accent?: string; swatch?: string;
  /** Tints the whole tile with a colour, monday-style. Any token. */
  tone?: string;
  /** A live number: counts up on arrival instead of appearing. */
  count?: React.ReactNode;
}) {
  const showDelta = delta != null && Number.isFinite(delta) && delta !== 0;
  const positive = showDelta && (deltaGood === "down" ? delta! < 0 : delta! > 0);

  return (
    <div
      className="lift rounded-[var(--radius-lg)] border border-[var(--color-line)] bg-[var(--color-surface)] p-4"
      style={
        tone
          ? {
              background: `color-mix(in srgb, ${tone} 7%, var(--color-surface))`,
              borderColor: `color-mix(in srgb, ${tone} 25%, var(--color-line))`,
            }
          : undefined
      }
    >
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--color-ink-3)]">
        {swatch && (
          <span aria-hidden className="h-[7px] w-[12px] shrink-0 rounded-full" style={{ background: swatch }} />
        )}
        {label}
      </p>
      <p className="mt-2 flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold leading-none tracking-tight"
          style={accent ? { color: accent } : tone ? { color: tone } : undefined}
        >
          {count ?? value}
        </span>
        {unit && <span className="text-[12px] text-[var(--color-ink-3)]">{unit}</span>}
      </p>
      {showDelta && (
        <p className="tabular mt-2 text-[11.5px] font-medium"
           style={{ color: positive ? "var(--color-good)" : "var(--color-serious)" }}>
          {delta! > 0 ? "▲" : "▼"} {Math.abs(delta!)}% vs previous
        </p>
      )}
      {hint && !showDelta && <p className="mt-2 text-[11.5px] text-[var(--color-ink-3)]">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------- Foundery additions
   Everything below was needed by a screen and didn't exist in the kit, so
   it lives here once rather than being re-invented per page. */

/* ------------------------------------------------------------------ Logo */

/**
 * The lockup.
 *
 * One artwork file and one element: the brand PNG is the yellow mark plus a
 * black wordmark, which is exactly right on a light ground. On a dark ground
 * `.logo-adaptive` knocks it out to solid white (see globals.css) — a plain
 * invert would turn the brand yellow blue, which is worse than losing it.
 *
 * `tone="dark"` forces the white treatment whatever the theme, for the black
 * panel on the sign-in page.
 */
export function Logo({ size = 28, tone = "auto" }: { size?: number; tone?: "auto" | "dark" }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/neuroid-logo-light.png"
      alt="Neuroid"
      height={size}
      className={tone === "auto" ? "logo-adaptive" : undefined}
      style={{
        height: size,
        width: "auto",
        filter: tone === "dark" ? "brightness(0) invert(1)" : undefined,
      }}
    />
  );
}

/* -------------------------------------------------------------- Sections */

/** The section-label voice: small, uppercase, wide, ink-3. Used sparingly. */
export function SectionLabel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={`text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--color-ink-3)] ${className}`}>
      {children}
    </p>
  );
}

export function CardTitle({
  title, hint, children,
}: {
  title: string; hint?: string; children?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h2 className="text-[14px] font-semibold">{title}</h2>
        {hint && <p className="mt-0.5 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">{hint}</p>}
      </div>
      {children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/* ---------------------------------------------------------------- Tables */

/**
 * Rule 14: wide content scrolls inside its own container, never the body.
 */
export function TableWrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] border-collapse text-left">{children}</table>
    </div>
  );
}

export function Th({
  children, align = "left", className = "",
}: {
  children?: React.ReactNode; align?: "left" | "right" | "center"; className?: string;
}) {
  return (
    <th
      className={`border-b border-[var(--color-line)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.07em] text-[var(--color-ink-3)] ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {children}
    </th>
  );
}

export function Td({
  children, align = "left", className = "",
}: {
  children?: React.ReactNode; align?: "left" | "right" | "center"; className?: string;
}) {
  return (
    <td
      className={`border-b border-[var(--color-line)] px-3 py-2.5 text-[13px] align-middle ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${className}`}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------- Redaction */

/**
 * Stands in for a figure the signed-in role isn't cleared to see.
 *
 * It is deliberately visible rather than silently absent: the operator
 * should know a number exists and that the total they're looking at is
 * complete, without learning the number. The value never reaches the
 * browser — this component only ever renders the placeholder.
 */
export function Redacted({ label = "Founder only" }: { label?: string }) {
  return (
    <span
      title={label}
      className="inline-flex items-center gap-1 rounded-[var(--radius-xs)] bg-[var(--color-surface-3)] px-1.5 py-0.5 text-[10.5px] font-medium text-[var(--color-ink-3)]"
    >
      <Lock size={9} aria-hidden />
      {label}
    </span>
  );
}

/* ----------------------------------------------------------------- Bars */

/** A single proportional bar. Used for cost mix and revenue concentration. */
export function BarRow({
  label, value, total, tone, right,
}: {
  label: React.ReactNode; value: number; total: number; tone: string; right?: React.ReactNode;
}) {
  const pct = total > 0 ? Math.max(0, (value / total) * 100) : 0;
  return (
    <div className="py-1.5">
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate text-[12.5px]">{label}</span>
        <span className="tabular shrink-0 text-[12.5px] font-medium">{right}</span>
        <span className="tabular w-[42px] shrink-0 text-right text-[11.5px] text-[var(--color-ink-3)]">
          {pct.toFixed(0)}%
        </span>
      </div>
      <div className="mt-1.5 h-2.5 w-full overflow-hidden rounded-full bg-[var(--color-surface-3)]">
        <div className="grow h-full rounded-full" style={{ width: `${pct}%`, background: tone }} />
      </div>
    </div>
  );
}

/**
 * A profit-or-loss column chart. Bars grow up from a zero line for profit
 * and down for a loss, so a bad month is legible at a glance rather than
 * needing the axis read.
 */
export function ProfitBars({
  points, height = 132,
}: {
  points: { label: string; value: number; hint?: string }[]; height?: number;
}) {
  const peak = Math.max(1, ...points.map((p) => Math.abs(p.value)));
  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-[520px] items-end gap-2" style={{ height }}>
        {points.map((point) => {
          const magnitude = (Math.abs(point.value) / peak) * (height / 2 - 14);
          const positive = point.value >= 0;
          return (
            <div key={point.label} className="flex min-w-0 flex-1 flex-col items-center" style={{ height }}>
              <div className="flex w-full flex-1 items-end justify-center">
                {positive && (
                  <div
                    title={point.hint}
                    className="grow-up w-full max-w-[34px] rounded-t-[var(--radius-xs)]"
                    style={{ height: Math.max(2, magnitude), background: "var(--color-good)" }}
                  />
                )}
              </div>
              <div className="h-px w-full bg-[var(--color-line-strong)]" />
              <div className="flex w-full flex-1 items-start justify-center">
                {!positive && (
                  <div
                    title={point.hint}
                    className="grow-down w-full max-w-[34px] rounded-b-[var(--radius-xs)]"
                    style={{ height: Math.max(2, magnitude), background: "var(--color-critical)" }}
                  />
                )}
              </div>
              <span className="mt-1 truncate text-[10px] text-[var(--color-ink-3)]">{point.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The one scrolling pane (rule 10). Everything a page renders below its
 * PageHeader goes in here.
 */
export function PageBody({
  children, width = 980,
}: {
  children: React.ReactNode; width?: number;
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-5">
      {/* .rise replays on every route change because the node remounts —
          each navigation answers with motion instead of a hard swap. */}
      <div className="rise mx-auto space-y-4" style={{ maxWidth: width }}>
        {children}
      </div>
    </div>
  );
}

/** A quiet strip that explains why a screen is showing less than it could. */
export function PolicyNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-[var(--radius-md)] bg-[var(--color-surface-2)] px-3 py-2.5 text-[11.5px] leading-relaxed text-[var(--color-ink-2)]">
      <Lock size={12} className="mt-[2px] shrink-0 text-[var(--color-ink-3)]" aria-hidden />
      <span className="min-w-0">{children}</span>
    </p>
  );
}
