import { describe, expect, it } from "vitest";
import {
  investmentCapabilityStatus,
  investmentHoldingIdentity,
  manualReconciliationCandidates,
  normalizePlaidAccountType,
  plaidAccountBalanceUpdate,
  plaidAccountUpsertDecision,
  shouldImportAsSpendingTransaction,
} from "../supabase/functions/_shared/plaid-account-normalization.ts";

describe("Plaid account normalization", () => {
  it.each([
    ["tfsa", "tfsa"],
    ["rrsp", "rrsp"],
    ["fhsa", "fhsa"],
    ["brokerage", "non_registered_investment"],
  ])("maps investment subtype %s", (subtype, expected) => {
    expect(normalizePlaidAccountType("investment", subtype)).toBe(expected);
  });

  it("uses a generic fallback for unknown subtypes and account types", () => {
    expect(normalizePlaidAccountType("investment", "new-registered-plan")).toBe("non_registered_investment");
    expect(normalizePlaidAccountType("future-type", "future-subtype")).toBe("other");
  });

  it("maps standard banking and credit accounts", () => {
    expect(normalizePlaidAccountType("depository", "checking")).toBe("chequing");
    expect(normalizePlaidAccountType("depository", "savings")).toBe("savings");
    expect(normalizePlaidAccountType("credit", "credit card")).toBe("credit_card");
  });
});

describe("Plaid reconciliation", () => {
  it("prevents a duplicate Plaid account by updating a stable existing ID", () => {
    expect(plaidAccountUpsertDecision("tracked-account", 2)).toEqual({
      action: "update",
      includeInNetWorth: true,
      reconciliationStatus: "not_needed",
    });
  });

  it("holds a possible duplicate out of net worth until manual reconciliation", () => {
    expect(plaidAccountUpsertDecision(null, 1)).toEqual({
      action: "create",
      includeInNetWorth: false,
      reconciliationStatus: "needs_review",
    });
  });

  it("finds a same-institution, same-type manual account without auto-merging", () => {
    const candidates = manualReconciliationCandidates(
      { name: "CIBC TFSA", official_name: "Tax-Free Savings Account", type: "investment", subtype: "tfsa" },
      "CIBC",
      [{ id: "manual", name: "My TFSA", type: "tfsa", institution: "CIBC", plaid_account_id: null }],
    );
    expect(candidates.map((candidate) => candidate.id)).toEqual(["manual"]);
    expect(plaidAccountUpsertDecision(null, candidates.length).reconciliationStatus).toBe("needs_review");
  });

  it("updates both current and available balances from Plaid", () => {
    expect(plaidAccountBalanceUpdate({ current: 20_350, available: 20_100 }, "2026-08-16")).toEqual({
      current_balance: 20_350,
      available_balance: 20_100,
      balance_as_of: "2026-08-16",
    });
  });
});

describe("investment isolation and capability fallback", () => {
  it("never sends investment accounts through spending analytics", () => {
    expect(shouldImportAsSpendingTransaction("investment")).toBe(false);
    expect(shouldImportAsSpendingTransaction("depository")).toBe(true);
  });

  it("keeps an investment account as balance-only when holdings are unsupported", () => {
    expect(investmentCapabilityStatus(1, "unsupported")).toBe("balance_only");
    expect(investmentCapabilityStatus(0, "unsupported")).toBe("unavailable");
  });

  it("uses a stable holding identity for idempotent upserts", () => {
    expect(investmentHoldingIdentity("account-1", "security-1")).toBe("account-1:security-1");
    expect(new Set([
      investmentHoldingIdentity("account-1", "security-1"),
      investmentHoldingIdentity("account-1", "security-1"),
    ]).size).toBe(1);
  });
});
