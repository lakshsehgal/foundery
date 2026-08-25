import type { Metadata } from "next";
import { AlertTriangle, CheckCircle2, Crown } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { billingTasks, type BillingTask } from "@/lib/queries";
import { defaultCurrency, fmtMoney } from "@/lib/money";
import { prettyDate, todayISO } from "@/lib/dates";
import {
  Card, CardTitle, Chip, EmptyState, PageBody, PageHeader, StatTile,
} from "@/components/ui/primitives";
import { Ticker } from "@/components/ui/ticker";
import { MarkRaisedButton, UndoMarkButton } from "./mark-button";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

/**
 * Invoicing itself lives in Zoho Books. This page answers one question per
 * retainer per month — did the invoice go out? — and gives you the tick.
 */
export default async function InvoicesPage() {
  const role = await requireRole();
  const today = todayISO();
  const tasks = await billingTasks(role, today);
  const currency = defaultCurrency();

  const currentMonth = today.slice(0, 7);
  const current = tasks.filter((task) => task.month === currentMonth);
  const missed = tasks.filter((task) => task.month < currentMonth && !task.raised);
  const raisedCount = current.filter((task) => task.raised).length;
  const dueCount = current.filter((task) => !task.raised && task.days <= 0).length;
  const monthLabel = current[0]?.monthLabel ?? "";

  function statusFor(task: BillingTask) {
    if (task.raised) {
      return { label: `Raised${task.raisedAt ? ` · ${prettyDate(task.raisedAt)}` : ""}`, tone: "var(--color-good)" };
    }
    if (task.days < 0) {
      return {
        label: `${Math.abs(task.days)} ${Math.abs(task.days) === 1 ? "day" : "days"} late`,
        tone: "var(--color-critical)",
      };
    }
    if (task.days <= 3) return { label: `Due ${task.days === 0 ? "today" : prettyDate(task.raiseOn)}`, tone: "var(--color-warning)" };
    return { label: `Up next · ${prettyDate(task.raiseOn)}`, tone: "var(--color-ink-3)" };
  }

  function TaskRow({ task }: { task: BillingTask }) {
    const status = statusFor(task);
    return (
      <li className="flex flex-wrap items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-semibold">
            <span className="min-w-0 truncate">{task.clientName}</span>
            {task.vip && (
              <span
                title="VIP account"
                className="inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                style={{ background: "var(--color-brand)", color: "var(--color-brand-ink)" }}
              >
                <Crown size={9} aria-hidden />
                VIP
              </span>
            )}
          </p>
          <p className="mt-0.5 text-[11.5px] text-[var(--color-ink-3)]">
            Bills day {task.billingDay}
            {task.amount !== null && ` · ${fmtMoney(task.amount, currency)} / month`}
          </p>
        </div>
        <Chip tone={status.tone}>{status.label}</Chip>
        {task.raised ? (
          <UndoMarkButton clientId={task.clientId} month={task.month} />
        ) : (
          <MarkRaisedButton clientId={task.clientId} month={task.month} />
        )}
      </li>
    );
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Raised in Zoho Books — ticked off here so nothing slips a month"
      />
      <PageBody width={860}>
        <div className="stagger grid gap-3 sm:grid-cols-3">
          <StatTile
            label="Still to raise"
            count={<Ticker value={current.length - raisedCount} />}
            tone={dueCount > 0 ? "var(--color-warning)" : "var(--color-series-1)"}
            hint={dueCount > 0 ? `${dueCount} past the billing day` : `For ${monthLabel}`}
          />
          <StatTile
            label="Raised"
            count={<Ticker value={raisedCount} />}
            tone="var(--color-good)"
            hint={`Of ${current.length} retainer${current.length === 1 ? "" : "s"} this month`}
          />
          <StatTile
            label="Missed last month"
            count={<Ticker value={missed.length} />}
            tone={missed.length > 0 ? "var(--color-critical)" : undefined}
            hint={missed.length > 0 ? "Raise these first" : "Nothing slipped"}
          />
        </div>

        {missed.length > 0 && (
          <Card padded={false}>
            <div className="p-4 pb-0">
              <CardTitle
                title={`Missed — ${missed[0].monthLabel}`}
                hint="The month closed without these going out. Raise them in Zoho, then tick them off here."
              />
            </div>
            <ul className="stagger divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {missed.map((task) => (
                <TaskRow key={`${task.clientId}-${task.month}`} task={task} />
              ))}
            </ul>
          </Card>
        )}

        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title={`This month — ${monthLabel}`}
              hint="Every active retainer, in billing-day order. Raise the invoice in Zoho Books, then mark it here."
            />
          </div>
          {current.length === 0 ? (
            <EmptyState
              icon={<CheckCircle2 size={22} />}
              title="No retainers to bill"
              hint="Active retainer clients show up here each month with their billing day."
            />
          ) : (
            <ul className="stagger divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {current.map((task) => (
                <TaskRow key={`${task.clientId}-${task.month}`} task={task} />
              ))}
            </ul>
          )}
        </Card>

        <p className="flex items-start gap-2 text-[11.5px] leading-relaxed text-[var(--color-ink-3)]">
          <AlertTriangle size={13} className="mt-[1px] shrink-0" aria-hidden />
          Amounts, PDFs and payment chasing live in Zoho Books. This list answers one question —
          did this month&apos;s invoice go out? One-off project invoices are raised straight in Zoho
          as milestones land.
        </p>
      </PageBody>
    </>
  );
}
