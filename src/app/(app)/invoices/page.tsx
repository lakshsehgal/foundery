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
import {
  MarkPaidButton, MarkRaisedButton, UndoMarkButton, UndoPaidButton,
} from "./mark-button";
import { ReminderButton } from "./reminder-button";

export const metadata: Metadata = { title: "Invoices" };
export const dynamic = "force-dynamic";

/**
 * Invoicing itself lives in Zoho Books. Each retainer-month here is a
 * two-tick task: raised in Zoho, then payment received — and this page is
 * where both ticks happen.
 */
export default async function InvoicesPage() {
  const role = await requireRole();
  const today = todayISO();
  const tasks = await billingTasks(role, today);
  const currency = defaultCurrency();

  const currentMonth = today.slice(0, 7);
  const current = tasks.filter((task) => task.month === currentMonth);
  const missed = tasks.filter((task) => task.month < currentMonth && !task.raised);
  const awaiting = tasks.filter((task) => task.raised && !task.paid);
  const awaitingLastMonth = awaiting.filter((task) => task.month < currentMonth);
  const raisedCount = current.filter((task) => task.raised).length;
  const dueCount = current.filter((task) => !task.raised && task.days <= 0).length;
  const monthLabel = current[0]?.monthLabel ?? "";

  function statusFor(task: BillingTask) {
    if (task.paid) {
      return {
        label: `Paid${task.paidAt ? ` · ${prettyDate(task.paidAt)}` : ""}`,
        tone: "var(--color-good)",
      };
    }
    if (task.raised) {
      return {
        label: `Raised${task.raisedAt ? ` · ${prettyDate(task.raisedAt)}` : ""} · awaiting payment`,
        tone: "var(--color-series-1)",
      };
    }
    if (task.days < 0) {
      return {
        label: `${Math.abs(task.days)} ${Math.abs(task.days) === 1 ? "day" : "days"} late`,
        tone: "var(--color-critical)",
      };
    }
    if (task.days <= 3) {
      return {
        label: `Due ${task.days === 0 ? "today" : prettyDate(task.raiseOn)}`,
        tone: "var(--color-warning)",
      };
    }
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
        {/* The two ticks: raise it first, then the payment — with a nudge
            button while the money is still out. */}
        {!task.raised && <MarkRaisedButton clientId={task.clientId} month={task.month} />}
        {task.raised && !task.paid && (
          <>
            <ReminderButton
              clientId={task.clientId}
              clientName={task.clientName}
              billingEmail={task.billingEmail}
              billingCc={task.billingCc}
              monthLabel={task.monthLabel}
              amountLabel={task.amount !== null ? fmtMoney(task.amount, currency) : null}
            />
            <MarkPaidButton clientId={task.clientId} month={task.month} />
            <UndoMarkButton clientId={task.clientId} month={task.month} />
          </>
        )}
        {task.paid && <UndoPaidButton clientId={task.clientId} month={task.month} />}
      </li>
    );
  }

  return (
    <>
      <PageHeader
        title="Invoices"
        subtitle="Raised in Zoho Books, then paid — two ticks so nothing slips"
      />
      <PageBody width={860}>
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
            label="Awaiting payment"
            count={<Ticker value={awaiting.length} />}
            tone={awaiting.length > 0 ? "var(--color-series-1)" : undefined}
            hint={
              awaitingLastMonth.length > 0
                ? `${awaitingLastMonth.length} from last month`
                : "Raised, money not yet in"
            }
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

        {awaitingLastMonth.length > 0 && (
          <Card padded={false}>
            <div className="p-4 pb-0">
              <CardTitle
                title={`Awaiting payment — ${awaitingLastMonth[0].monthLabel}`}
                hint="Raised last month, money not yet marked in. Chase in Zoho, tick here when it lands."
              />
            </div>
            <ul className="stagger divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {awaitingLastMonth.map((task) => (
                <TaskRow key={`${task.clientId}-${task.month}`} task={task} />
              ))}
            </ul>
          </Card>
        )}

        <Card padded={false}>
          <div className="p-4 pb-0">
            <CardTitle
              title={`This month — ${monthLabel}`}
              hint="Every active retainer, in billing-day order. Raise the invoice in Zoho Books, mark it, then tick again when the payment lands."
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
          Amounts, PDFs and the actual chasing live in Zoho Books. This list answers two questions —
          did this month&apos;s invoice go out, and did the money come in? One-off project invoices
          are raised straight in Zoho as milestones land.
        </p>
      </PageBody>
    </>
  );
}
