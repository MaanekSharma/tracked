export type TransactionTypeOverride = "income" | "expense" | "transfer";

export type ExistingPlaidTransactionRow = {
  id: string;
  plaid_transaction_id: string;
  category_id: string | null;
  category_source: string | null;
  type_override: TransactionTypeOverride | null;
  excluded_from_spending: boolean;
  notes: string | null;
};

type InsertDecision = {
  action: "insert";
  target: null;
  rekeysPending: false;
  supersededPending: null;
};

type UpdateDecision = {
  action: "update";
  target: ExistingPlaidTransactionRow;
  rekeysPending: boolean;
  supersededPending: ExistingPlaidTransactionRow | null;
};

export type PlaidTransactionWriteDecision = InsertDecision | UpdateDecision;

export type SupersededPendingMetadataMerge = {
  category: { category_id: string | null; category_source: "manual" } | null;
  typeOverride: TransactionTypeOverride | null;
  excludeFromSpending: boolean;
  notes: string | null;
};

export function planPlaidTransactionWrite(
  existing: ExistingPlaidTransactionRow[],
  plaidTransactionId: string,
  pendingTransactionId: string | null | undefined,
): PlaidTransactionWriteDecision {
  const current = existing.find((row) => row.plaid_transaction_id === plaidTransactionId) ?? null;
  const pending = pendingTransactionId && pendingTransactionId !== plaidTransactionId
    ? existing.find((row) => row.plaid_transaction_id === pendingTransactionId) ?? null
    : null;

  if (current) {
    return {
      action: "update",
      target: current,
      rekeysPending: false,
      supersededPending: pending?.id === current.id ? null : pending,
    };
  }

  if (pending) {
    return {
      action: "update",
      target: pending,
      rekeysPending: true,
      supersededPending: null,
    };
  }

  return {
    action: "insert",
    target: null,
    rekeysPending: false,
    supersededPending: null,
  };
}

export function categoryFieldsForPlaidUpdate(
  existing: Pick<ExistingPlaidTransactionRow, "category_source">,
  category: { category_id: string | null; category_source: string | null },
) {
  if (existing.category_source === "manual") return {};
  return category;
}

export function planSupersededPendingMetadataMerge(
  posted: ExistingPlaidTransactionRow,
  pending: ExistingPlaidTransactionRow,
): SupersededPendingMetadataMerge {
  return {
    category: posted.category_source !== "manual" && pending.category_source === "manual"
      ? { category_id: pending.category_id, category_source: "manual" }
      : null,
    typeOverride: posted.type_override === null ? pending.type_override : null,
    excludeFromSpending: !posted.excluded_from_spending && pending.excluded_from_spending,
    notes: posted.notes === null ? pending.notes : null,
  };
}
