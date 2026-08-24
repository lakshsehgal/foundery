"use client";

import { useState } from "react";
import { Lock, Pencil, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/form";
import {
  BarRow, Card, CardTitle, Chip, EmptyState, TableWrap, Td, Th,
} from "@/components/ui/primitives";
import { CATEGORY_LABEL, CATEGORY_TONE, COST_CATEGORIES, type CostCategory } from "@/lib/taxonomy";
import type { CostView } from "@/lib/queries";
import { CostEditor } from "./cost-editor";

export type CostRowDisplay = CostView & {
  amountLabel: string;
  monthlyLabel: string;
  cadenceLabel: string;
};

export function CostsView({
  rows, totals, burnLabel, canEdit, currencySymbol, clients,
}: {
  rows: CostRowDisplay[];
  totals: { category: CostCategory; total: number; label: string; count: number }[];
  burnLabel: string;
  canEdit: boolean;
  currencySymbol: string;
  clients: { id: number; name: string }[];
}) {
  const [editing, setEditing] = useState<CostView | null>(null);
  const [open, setOpen] = useState(false);
  const [openedAt, setOpenedAt] = useState(0);
  const [category, setCategory] = useState<CostCategory | "all">("all");

  const grandTotal = totals.reduce((sum, row) => sum + row.total, 0);
  const shown = category === "all" ? rows : rows.filter((row) => row.category === category);

  function edit(cost: CostView | null) {
    setEditing(cost);
    setOpen(true);
    setOpenedAt((n) => n + 1);
  }

  return (
    <>
      <Card>
        <CardTitle
          title="Where the money goes"
          hint={`${burnLabel} a month, every category included. Annual costs are counted at a twelfth.`}
        >
          {canEdit && (
            <Button variant="primary" onClick={() => edit(null)}>
              <Plus size={14} />
              Add cost
            </Button>
          )}
        </CardTitle>

        {grandTotal === 0 ? (
          <EmptyState
            icon={<Wallet size={22} />}
            title="No costs recorded"
            hint="Add salaries, tools, contractors and the rest — the founder numbers are only as honest as this list."
            action={
              canEdit ? (
                <Button variant="primary" onClick={() => edit(null)}>
                  <Plus size={14} />
                  Add the first one
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div>
            {totals
              .filter((row) => row.total > 0)
              .map((row) => (
                <BarRow
                  key={row.category}
                  label={
                    <span className="flex items-center gap-2">
                      {CATEGORY_LABEL[row.category]}
                      <span className="text-[11px] text-[var(--color-ink-3)]">
                        {row.count} {row.count === 1 ? "line" : "lines"}
                      </span>
                    </span>
                  }
                  value={row.total}
                  total={grandTotal}
                  tone={CATEGORY_TONE[row.category]}
                  right={row.label}
                />
              ))}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={() => setCategory("all")}
          className={`rounded-[var(--radius-xs)] px-2 py-1 text-[12px] transition-colors ${
            category === "all"
              ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
              : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
          }`}
        >
          Everything
        </button>
        {COST_CATEGORIES.map((definition) => {
          const total = totals.find((t) => t.category === definition.key);
          if (!total || total.count === 0) return null;
          return (
            <button
              key={definition.key}
              onClick={() => setCategory(definition.key)}
              title={definition.hint}
              className={`flex items-center gap-1.5 rounded-[var(--radius-xs)] px-2 py-1 text-[12px] transition-colors ${
                category === definition.key
                  ? "bg-[var(--color-surface-3)] font-medium text-[var(--color-ink)]"
                  : "text-[var(--color-ink-2)] hover:bg-[var(--color-surface-2)]"
              }`}
            >
              <span
                aria-hidden
                className="h-[7px] w-[12px] rounded-full"
                style={{ background: definition.tone }}
              />
              {definition.label}
            </button>
          );
        })}
      </div>

      <Card padded={false}>
        {shown.length === 0 ? (
          <EmptyState title="Nothing in this category" hint="Try another one." />
        ) : (
          <TableWrap>
            <thead>
              <tr>
                <Th>Cost</Th>
                <Th>Category</Th>
                <Th>How often</Th>
                <Th align="right">Amount</Th>
                <Th align="right">Per month</Th>
                {canEdit && <Th align="right" />}
              </tr>
            </thead>
            <tbody>
              {shown.map((row) => (
                <tr
                  key={row.id ?? `aggregate-${row.category}`}
                  className="transition-colors hover:bg-[var(--color-surface-2)]"
                >
                  <Td>
                    <div className="flex min-w-0 items-center gap-2">
                      {row.aggregated && (
                        <Lock size={11} className="shrink-0 text-[var(--color-ink-3)]" aria-hidden />
                      )}
                      <span className="min-w-0 truncate font-medium">{row.label}</span>
                    </div>
                    {row.person && (
                      <p className="mt-0.5 truncate text-[11px] text-[var(--color-ink-3)]">{row.person}</p>
                    )}
                    {row.aggregated && (
                      <p className="mt-0.5 text-[11px] text-[var(--color-ink-3)]">
                        Total only — individual pay isn&apos;t shown here.
                      </p>
                    )}
                  </Td>
                  <Td>
                    <Chip tone={CATEGORY_TONE[row.category]}>{CATEGORY_LABEL[row.category]}</Chip>
                  </Td>
                  <Td>
                    <span className="text-[12.5px] text-[var(--color-ink-2)]">{row.cadenceLabel}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular">{row.amountLabel}</span>
                  </Td>
                  <Td align="right">
                    <span className="tabular font-medium">{row.monthlyLabel}</span>
                  </Td>
                  {canEdit && (
                    <Td align="right">
                      {row.editable && (
                        <button
                          onClick={() => edit(row)}
                          aria-label={`Edit ${row.label}`}
                          className="grid h-7 w-7 place-items-center rounded-[var(--radius-sm)] text-[var(--color-ink-3)] transition-colors hover:bg-[var(--color-surface-3)] hover:text-[var(--color-ink)]"
                        >
                          <Pencil size={13} />
                        </button>
                      )}
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </TableWrap>
        )}
      </Card>

      {canEdit && (
        <CostEditor
          key={`${editing?.id ?? "new"}-${openedAt}`}
          open={open}
          onClose={() => setOpen(false)}
          cost={editing}
          currencySymbol={currencySymbol}
          clients={clients}
        />
      )}
    </>
  );
}
