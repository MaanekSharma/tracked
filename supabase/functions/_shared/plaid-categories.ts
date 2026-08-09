import type { Transaction } from "npm:plaid@45.0.0";

export type BudgetCategoryRow = {
  id: string;
  name: string;
  group_name: string;
};

export type PlaidCategoryRuleRow = {
  id: string;
  match_text: string;
  category_id: string;
  priority: number;
  active: boolean;
};

type CategorySource = "plaid" | "rule";

type Categorization = {
  category_id: string | null;
  category_source: CategorySource | null;
};

const merchantOverrides = [
  { match: "uber eats", category: "Dining Out" },
  { match: "netflix", category: "Subscriptions" },
  { match: "spotify", category: "Subscriptions" },
  { match: "goodlife", category: "Fitness" },
  { match: "uber", category: "Uber / Taxi" },
];

const detailedCategoryMap: Record<string, string | null> = {
  BANK_FEES: "Fees",
  FOOD_AND_DRINK_COFFEE: "Coffee",
  FOOD_AND_DRINK_FAST_FOOD: "Dining Out",
  FOOD_AND_DRINK_GROCERIES: "Groceries",
  FOOD_AND_DRINK_RESTAURANT: "Dining Out",
  GENERAL_MERCHANDISE_CLOTHING_AND_ACCESSORIES: "Shopping",
  GENERAL_MERCHANDISE_ONLINE_MARKETPLACES: "Shopping",
  GENERAL_MERCHANDISE_SUPERSTORES: "Shopping",
  INCOME_DIVIDENDS: null,
  INCOME_INTEREST_EARNED: null,
  INCOME_RETIREMENT_PENSION: null,
  INCOME_TAX_REFUND: null,
  INCOME_WAGES: null,
  LOAN_PAYMENTS_CREDIT_CARD_PAYMENT: null,
  RENT_AND_UTILITIES_GAS_AND_ELECTRICITY: "Hydro",
  RENT_AND_UTILITIES_INTERNET_AND_CABLE: "Internet",
  RENT_AND_UTILITIES_RENT: "Rent",
  RENT_AND_UTILITIES_TELEPHONE: "Internet",
  TRANSFER_IN_ACCOUNT_TRANSFER: null,
  TRANSFER_IN_DEPOSIT: null,
  TRANSFER_OUT_ACCOUNT_TRANSFER: null,
  TRANSFER_OUT_WITHDRAWAL: null,
  TRANSPORTATION_BIKES_AND_SCOOTERS: "Public Transit",
  TRANSPORTATION_GAS: "Gas",
  TRANSPORTATION_PARKING: "Parking",
  TRANSPORTATION_PUBLIC_TRANSIT: "Public Transit",
  TRANSPORTATION_TAXIS_AND_RIDE_SHARES: "Uber / Taxi",
  TRANSPORTATION_TOLLS: "Vehicle",
  TRAVEL_FLIGHTS: "Travel",
  TRAVEL_HOTELS_AND_LODGING: "Travel",
  TRAVEL_RENTAL_CARS: "Travel",
};

const primaryCategoryMap: Record<string, string | null> = {
  BANK_FEES: "Fees",
  ENTERTAINMENT: "Entertainment",
  FOOD_AND_DRINK: "Dining Out",
  GENERAL_MERCHANDISE: "Shopping",
  GENERAL_SERVICES: "Miscellaneous",
  GOVERNMENT_AND_NON_PROFIT: "Miscellaneous",
  HOME_IMPROVEMENT: "Household",
  INCOME: null,
  LOAN_PAYMENTS: null,
  MEDICAL: "Miscellaneous",
  PERSONAL_CARE: "Personal Care",
  RENT_AND_UTILITIES: "Household",
  TRANSFER_IN: null,
  TRANSFER_OUT: null,
  TRANSPORTATION: "Uber / Taxi",
  TRAVEL: "Travel",
};

function normalize(value: string | null | undefined) {
  return (value ?? "").toLowerCase().trim();
}

function findCategory(categories: BudgetCategoryRow[], categoryName: string | null | undefined) {
  if (!categoryName) return null;
  const normalized = normalize(categoryName);
  return categories.find((category) => normalize(category.name) === normalized)?.id ?? null;
}

function mappedCategoryName(primary: string, detailed: string) {
  if (Object.prototype.hasOwnProperty.call(detailedCategoryMap, detailed)) {
    return detailedCategoryMap[detailed];
  }
  if (Object.prototype.hasOwnProperty.call(primaryCategoryMap, primary)) {
    return primaryCategoryMap[primary];
  }
  return "Miscellaneous";
}

export function categorizePlaidTransaction(
  transaction: Transaction,
  categories: BudgetCategoryRow[],
  rules: PlaidCategoryRuleRow[],
): Categorization {
  if (transaction.amount < 0) {
    return { category_id: null, category_source: null };
  }

  const searchable = normalize(
    [
      transaction.merchant_name,
      transaction.name,
      transaction.original_description,
    ]
      .filter(Boolean)
      .join(" "),
  );

  const customRule = rules
    .filter((rule) => rule.active)
    .sort((a, b) => a.priority - b.priority)
    .find((rule) => searchable.includes(normalize(rule.match_text)));

  if (customRule) {
    return { category_id: customRule.category_id, category_source: "rule" };
  }

  const staticRule = merchantOverrides.find((rule) => searchable.includes(rule.match));
  const staticCategoryId = findCategory(categories, staticRule?.category);
  if (staticCategoryId) {
    return { category_id: staticCategoryId, category_source: "rule" };
  }

  const detailed = transaction.personal_finance_category?.detailed ?? "";
  const primary = transaction.personal_finance_category?.primary ?? "";
  const categoryName = mappedCategoryName(primary, detailed);
  const categoryId = findCategory(categories, categoryName);

  return {
    category_id: categoryId,
    category_source: categoryId ? "plaid" : null,
  };
}
