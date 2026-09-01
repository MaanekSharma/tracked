import { describe, expect, it } from "vitest";
import {
  categoryFieldsForPlaidUpdate,
  planPlaidTransactionWrite,
  planSupersededPendingMetadataMerge,
  type ExistingPlaidTransactionRow,
} from "../supabase/functions/_shared/plaid-transaction-reconciliation.ts";

function existingTransaction(
  overrides: Partial<ExistingPlaidTransactionRow> = {},
): ExistingPlaidTransactionRow {
  return {
    id: "tracked-transaction",
    plaid_transaction_id: "plaid-transaction",
    category_id: null,
    category_source: null,
    type_override: null,
    excluded_from_spending: false,
    notes: null,
    ...overrides,
  };
}

describe("Plaid transaction write planning", () => {
  it("updates an existing transaction with the same Plaid id", () => {
    const current = existingTransaction({
      category_id: "manual-category",
      category_source: "manual",
      type_override: "transfer",
      excluded_from_spending: true,
      notes: "Keep this note",
    });

    const decision = planPlaidTransactionWrite([current], "plaid-transaction", null);

    expect(decision).toMatchObject({
      action: "update",
      target: current,
      rekeysPending: false,
      supersededPending: null,
    });
  });

  it("rekeys the pending row so its user metadata stays on the posted transaction", () => {
    const pending = existingTransaction({
      plaid_transaction_id: "pending-id",
      category_id: "manual-category",
      category_source: "manual",
      type_override: "transfer",
      excluded_from_spending: true,
      notes: "User-owned metadata",
    });

    const decision = planPlaidTransactionWrite([pending], "posted-id", "pending-id");

    expect(decision).toMatchObject({
      action: "update",
      target: pending,
      rekeysPending: true,
      supersededPending: null,
    });
  });

  it("uses the posted row on retries and identifies a separate pending duplicate", () => {
    const posted = existingTransaction({ id: "posted-row", plaid_transaction_id: "posted-id" });
    const pending = existingTransaction({ id: "pending-row", plaid_transaction_id: "pending-id" });

    const decision = planPlaidTransactionWrite([pending, posted], "posted-id", "pending-id");

    expect(decision).toMatchObject({
      action: "update",
      target: posted,
      rekeysPending: false,
      supersededPending: pending,
    });
  });

  it("treats an already rekeyed pending row as an idempotent posted update", () => {
    const rekeyed = existingTransaction({
      id: "stable-row-id",
      plaid_transaction_id: "posted-id",
      type_override: "transfer",
      excluded_from_spending: true,
    });

    const decision = planPlaidTransactionWrite([rekeyed], "posted-id", "pending-id");

    expect(decision).toMatchObject({
      action: "update",
      target: rekeyed,
      rekeysPending: false,
      supersededPending: null,
    });
  });

  it("inserts only when neither the posted nor pending Plaid id exists", () => {
    expect(planPlaidTransactionWrite([], "posted-id", "pending-id")).toEqual({
      action: "insert",
      target: null,
      rekeysPending: false,
      supersededPending: null,
    });
  });
});

describe("Plaid transaction user metadata", () => {
  it("omits manual category fields from updates", () => {
    const existing = existingTransaction({ category_id: "manual-category", category_source: "manual" });

    expect(categoryFieldsForPlaidUpdate(existing, {
      category_id: "plaid-category",
      category_source: "plaid",
    })).toEqual({});
  });

  it("allows Plaid-managed categories to refresh", () => {
    const existing = existingTransaction({ category_id: "old-category", category_source: "plaid" });

    expect(categoryFieldsForPlaidUpdate(existing, {
      category_id: "new-category",
      category_source: "plaid",
    })).toEqual({
      category_id: "new-category",
      category_source: "plaid",
    });
  });

  it("fills missing posted metadata from a superseded pending row", () => {
    const posted = existingTransaction({
      id: "posted-row",
      plaid_transaction_id: "posted-id",
      category_id: "plaid-category",
      category_source: "plaid",
    });
    const pending = existingTransaction({
      id: "pending-row",
      plaid_transaction_id: "pending-id",
      category_id: "manual-category",
      category_source: "manual",
      type_override: "transfer",
      excluded_from_spending: true,
      notes: "Pending note",
    });

    expect(planSupersededPendingMetadataMerge(posted, pending)).toEqual({
      category: { category_id: "manual-category", category_source: "manual" },
      typeOverride: "transfer",
      excludeFromSpending: true,
      notes: "Pending note",
    });
  });

  it("keeps stronger user metadata already present on the posted row", () => {
    const posted = existingTransaction({
      id: "posted-row",
      plaid_transaction_id: "posted-id",
      category_id: "posted-category",
      category_source: "manual",
      type_override: "income",
      excluded_from_spending: true,
      notes: "Posted note",
    });
    const pending = existingTransaction({
      id: "pending-row",
      plaid_transaction_id: "pending-id",
      category_id: "pending-category",
      category_source: "manual",
      type_override: "transfer",
      excluded_from_spending: true,
      notes: "Pending note",
    });

    expect(planSupersededPendingMetadataMerge(posted, pending)).toEqual({
      category: null,
      typeOverride: null,
      excludeFromSpending: false,
      notes: null,
    });
  });

  it("does not promote Plaid-owned or empty pending metadata", () => {
    const posted = existingTransaction({
      id: "posted-row",
      plaid_transaction_id: "posted-id",
    });
    const pending = existingTransaction({
      id: "pending-row",
      plaid_transaction_id: "pending-id",
      category_id: "pending-category",
      category_source: "plaid",
    });

    expect(planSupersededPendingMetadataMerge(posted, pending)).toEqual({
      category: null,
      typeOverride: null,
      excludeFromSpending: false,
      notes: null,
    });
  });
});
