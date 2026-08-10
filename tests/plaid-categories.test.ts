import { describe, expect, it } from "vitest";
import {
  categorizePlaidTransaction,
  categoryForPlaidSync,
  type BudgetCategoryRow,
  type PlaidCategoryRuleRow,
} from "../supabase/functions/_shared/plaid-categories.ts";

type PlaidTransaction = Parameters<typeof categorizePlaidTransaction>[0];

const categories: BudgetCategoryRow[] = [
  { id: "cat-dining", group_name: "Food", name: "Dining Out" },
  { id: "cat-subscriptions", group_name: "Lifestyle", name: "Subscriptions" },
  { id: "cat-groceries", group_name: "Food", name: "Groceries" },
  { id: "cat-misc", group_name: "Other", name: "Miscellaneous" },
];

function plaidTransaction(overrides: Partial<PlaidTransaction> = {}): PlaidTransaction {
  return {
    amount: 25,
    merchant_name: "Unknown Merchant",
    name: "Unknown Merchant",
    original_description: "Unknown Merchant",
    personal_finance_category: {
      primary: "GENERAL_SERVICES",
      detailed: "GENERAL_SERVICES_OTHER_GENERAL_SERVICES",
      confidence_level: "VERY_HIGH",
    },
    ...overrides,
  } as PlaidTransaction;
}

describe("categorizePlaidTransaction", () => {
  it("uses custom Plaid category rules before static and Plaid category mappings", () => {
    const rules: PlaidCategoryRuleRow[] = [
      { id: "rule-1", match_text: "spotify", category_id: "cat-groceries", priority: 1, active: true },
    ];

    const result = categorizePlaidTransaction(
      plaidTransaction({
        merchant_name: "Spotify",
        personal_finance_category: {
          primary: "ENTERTAINMENT",
          detailed: "ENTERTAINMENT_MUSIC_AND_AUDIO",
          confidence_level: "VERY_HIGH",
        },
      }),
      categories,
      rules,
    );

    expect(result).toEqual({ category_id: "cat-groceries", category_source: "rule" });
  });

  it("uses static merchant overrides before Plaid category mappings", () => {
    const result = categorizePlaidTransaction(
      plaidTransaction({
        merchant_name: "Netflix",
        personal_finance_category: {
          primary: "ENTERTAINMENT",
          detailed: "ENTERTAINMENT_TV_AND_MOVIES",
          confidence_level: "VERY_HIGH",
        },
      }),
      categories,
      [],
    );

    expect(result).toEqual({ category_id: "cat-subscriptions", category_source: "rule" });
  });

  it("maps Plaid detailed categories when no rules match", () => {
    const result = categorizePlaidTransaction(
      plaidTransaction({
        merchant_name: "Local Market",
        personal_finance_category: {
          primary: "FOOD_AND_DRINK",
          detailed: "FOOD_AND_DRINK_GROCERIES",
          confidence_level: "VERY_HIGH",
        },
      }),
      categories,
      [],
    );

    expect(result).toEqual({ category_id: "cat-groceries", category_source: "plaid" });
  });

  it("falls back to Miscellaneous for unknown Plaid categories", () => {
    const result = categorizePlaidTransaction(
      plaidTransaction({
        personal_finance_category: {
          primary: "SOMETHING_NEW",
          detailed: "SOMETHING_NEW_DETAIL",
          confidence_level: "LOW",
        },
      }),
      categories,
      [],
    );

    expect(result).toEqual({ category_id: "cat-misc", category_source: "plaid" });
  });

  it("does not categorize income transactions as spending", () => {
    const result = categorizePlaidTransaction(plaidTransaction({ amount: -100 }), categories, []);

    expect(result).toEqual({ category_id: null, category_source: null });
  });
});

describe("categoryForPlaidSync", () => {
  it("preserves manually selected categories during future Plaid syncs", () => {
    const result = categoryForPlaidSync(
      { category_id: "manual-category", category_source: "manual" },
      { category_id: "cat-groceries", category_source: "plaid" },
    );

    expect(result).toEqual({ category_id: "manual-category", category_source: "manual" });
  });

  it("uses new sync categorization when the existing category was not manual", () => {
    const result = categoryForPlaidSync(
      { category_id: "old-category", category_source: "plaid" },
      { category_id: "cat-groceries", category_source: "plaid" },
    );

    expect(result).toEqual({ category_id: "cat-groceries", category_source: "plaid" });
  });
});
