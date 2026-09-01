export type TrackedAccountType =
  | "chequing"
  | "savings"
  | "credit_card"
  | "tfsa"
  | "fhsa"
  | "rrsp"
  | "non_registered_investment"
  | "cash"
  | "other";

export type PlaidAccountIdentity = {
  name: string;
  official_name?: string | null;
  mask?: string | null;
  type: string;
  subtype?: string | null;
};

export type ReconciliationAccount = {
  id: string;
  name: string;
  type: TrackedAccountType;
  institution?: string | null;
  mask?: string | null;
  plaid_account_id?: string | null;
  archived?: boolean;
};

export type PlaidBalance = {
  current?: number | null;
  available?: number | null;
};

function normalized(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKD")
    .replace(/[^a-zA-Z0-9]/g, "")
    .toLowerCase();
}

export function normalizePlaidAccountType(type: string, subtype?: string | null): TrackedAccountType {
  const normalizedType = normalized(type);
  const normalizedSubtype = normalized(subtype);

  if (normalizedType === "investment") {
    if (normalizedSubtype === "tfsa") return "tfsa";
    if (normalizedSubtype === "rrsp") return "rrsp";
    if (normalizedSubtype === "fhsa") return "fhsa";
    return "non_registered_investment";
  }

  if (normalizedType === "credit") return "credit_card";
  if (normalizedType === "depository" && normalizedSubtype === "savings") return "savings";
  if (normalizedType === "depository") return "chequing";
  return "other";
}

export function isPlaidInvestmentAccount(account: Pick<PlaidAccountIdentity, "type">) {
  return normalized(account.type) === "investment";
}

export function shouldImportAsSpendingTransaction(plaidAccountType: string | null | undefined) {
  return normalized(plaidAccountType) !== "investment";
}

export function plaidAccountBalanceUpdate(balances: PlaidBalance, balanceAsOf: string) {
  return {
    current_balance: balances.current ?? 0,
    available_balance: balances.available ?? null,
    balance_as_of: balanceAsOf,
  };
}

export function plaidAccountUpsertDecision(existingAccountId: string | null, manualCandidateCount: number) {
  if (existingAccountId) return { action: "update" as const, includeInNetWorth: true, reconciliationStatus: "not_needed" as const };
  if (manualCandidateCount > 0) return { action: "create" as const, includeInNetWorth: false, reconciliationStatus: "needs_review" as const };
  return { action: "create" as const, includeInNetWorth: true, reconciliationStatus: "not_needed" as const };
}

export function investmentHoldingIdentity(plaidAccountId: string, plaidSecurityId: string) {
  return `${plaidAccountId}:${plaidSecurityId}`;
}

export function investmentCapabilityStatus(
  investmentAccountCount: number,
  holdingsResult: "available" | "unsupported" | "pending" | "error",
) {
  if (investmentAccountCount === 0) return "unavailable" as const;
  if (holdingsResult === "unsupported") return "balance_only" as const;
  return holdingsResult;
}

export function manualReconciliationCandidates(
  plaidAccount: PlaidAccountIdentity,
  institutionName: string | null,
  accounts: ReconciliationAccount[],
) {
  const mappedType = normalizePlaidAccountType(plaidAccount.type, plaidAccount.subtype);
  const plaidInstitution = normalized(institutionName);
  const plaidNames = new Set([normalized(plaidAccount.name), normalized(plaidAccount.official_name)].filter(Boolean));
  const plaidMask = normalized(plaidAccount.mask);

  return accounts.filter((candidate) => {
    if (candidate.archived || candidate.plaid_account_id || candidate.type !== mappedType) return false;

    const sameMask = Boolean(plaidMask && normalized(candidate.mask) === plaidMask);
    const sameInstitution = Boolean(plaidInstitution && normalized(candidate.institution) === plaidInstitution);
    const sameName = plaidNames.has(normalized(candidate.name));

    return sameMask || sameName || (sameInstitution && mappedType !== "other");
  });
}
