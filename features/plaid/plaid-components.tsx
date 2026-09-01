"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2, RefreshCw, ShieldCheck, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { type PlaidLinkOnExit, type PlaidLinkOnSuccess, usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invokePlaidFunction } from "@/features/plaid/plaid-client";

type LinkTokenResponse = {
  link_token: string;
  mode: "connect" | "update";
};

type SyncSummary = {
  added: number;
  modified: number;
  removed: number;
  accounts?: number;
  holdings?: number;
  investment_transactions?: number;
  investments_status?: "available" | "balance_only" | "unavailable" | "pending" | "error";
};

type ExchangeResponse = {
  institution_name?: string | null;
  sync?: SyncSummary;
};

type StoredLinkSession = {
  token: string;
  mode: "connect" | "update";
  plaidItemId?: string;
};

const LINK_SESSION_KEY = "tracked:plaid-link-session";

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the bank connection request.";
}

function plaidExitMessage(
  context: "connect" | "update",
  error: Parameters<PlaidLinkOnExit>[0],
  metadata: Parameters<PlaidLinkOnExit>[1],
  fallback: string,
) {
  const diagnostic = {
    context,
    error_type: error?.error_type ?? null,
    error_code: error?.error_code ?? null,
    error_message: error?.error_message ?? null,
    display_message: error?.display_message ?? null,
    request_id: metadata.request_id || null,
    institution_id: metadata.institution?.institution_id ?? null,
    institution_name: metadata.institution?.name ?? null,
    exit_status: metadata.status,
    link_session_id: metadata.link_session_id || null,
  };
  if (error) console.error("[TRACKED Plaid Link exit]", diagnostic);
  else console.info("[TRACKED Plaid Link exit]", diagnostic);

  const message = error?.display_message ?? error?.error_message ?? fallback;
  if (process.env.NODE_ENV !== "development" || !error) return message;
  const details = [
    error.error_code ? `Plaid error: ${error.error_code}.` : null,
    metadata.request_id ? `Request ID: ${metadata.request_id}.` : null,
  ].filter(Boolean).join(" ");
  return details ? `${message} ${details}` : message;
}

function readStoredLinkSession() {
  try {
    const value = window.sessionStorage.getItem(LINK_SESSION_KEY);
    return value ? JSON.parse(value) as StoredLinkSession : null;
  } catch {
    return null;
  }
}

function storeLinkSession(session: StoredLinkSession) {
  window.sessionStorage.setItem(LINK_SESSION_KEY, JSON.stringify(session));
}

function clearLinkSession() {
  window.sessionStorage.removeItem(LINK_SESSION_KEY);
}

function oauthReturnUri() {
  return new URL(window.location.href).searchParams.has("oauth_state_id") ? window.location.href : undefined;
}

function cleanOAuthUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("oauth_state_id")) return;
  url.searchParams.delete("oauth_state_id");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function syncToast(summary: SyncSummary) {
  const transactionChanges = summary.added + summary.modified + summary.removed;
  const investmentChanges = (summary.holdings ?? 0) + (summary.investment_transactions ?? 0);
  if (transactionChanges || investmentChanges) {
    return `Synced ${transactionChanges} transaction update${transactionChanges === 1 ? "" : "s"}${investmentChanges ? ` and ${investmentChanges} investment record${investmentChanges === 1 ? "" : "s"}` : ""}.`;
  }
  if (summary.investments_status === "balance_only") return "Balances are current. Detailed holdings are unavailable through this institution.";
  return "Everything is up to date.";
}

export function PlaidConnectButton({ existingInstitutions = [] }: { existingInstitutions?: string[] }) {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string>();
  const [isPreparing, setIsPreparing] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const shouldOpenRef = useRef(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
      clearLinkSession();
      cleanOAuthUrl();
      if (!publicToken) {
        toast.error("Plaid did not return a public token.");
        return;
      }

      setIsExchanging(true);
      setIsPreparing(false);
      try {
        const result = await invokePlaidFunction<ExchangeResponse>("plaid-exchange-public-token", {
          public_token: publicToken,
          institution: metadata.institution,
        });
        const imported = result.sync ? result.sync.added + result.sync.modified : 0;
        const investments = result.sync?.investments_status === "available" ? " Investments data is connected." : "";
        toast.success(`${result.institution_name ?? "Bank"} connected${imported ? ` with ${imported} transactions synced` : ""}.${investments}`);
        router.refresh();
      } catch (error) {
        toast.error(errorMessage(error));
      } finally {
        setIsExchanging(false);
        setLinkToken(null);
      }
    },
    [router],
  );

  const onExit = useCallback<PlaidLinkOnExit>((error, metadata) => {
    clearLinkSession();
    shouldOpenRef.current = false;
    setIsPreparing(false);
    const message = plaidExitMessage("connect", error, metadata, "Bank connection was cancelled.");
    if (error) toast.error(message);
  }, []);

  const { open, ready, error } = usePlaidLink({ token: linkToken, onSuccess, onExit, receivedRedirectUri });

  useEffect(() => {
    const stored = readStoredLinkSession();
    const redirectUri = oauthReturnUri();
    if (!stored || stored.mode !== "connect" || !redirectUri) return;
    const timeout = window.setTimeout(() => {
      shouldOpenRef.current = true;
      setIsPreparing(true);
      setReceivedRedirectUri(redirectUri);
      setLinkToken(stored.token);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, []);

  useEffect(() => {
    if (!shouldOpenRef.current || !ready) return;
    shouldOpenRef.current = false;
    open();
  }, [open, ready]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => {
      toast.error("Plaid Link could not load. Please try again.");
      clearLinkSession();
      shouldOpenRef.current = false;
      setIsPreparing(false);
      setLinkToken(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [error]);

  async function startLink() {
    if (
      existingInstitutions.length &&
      !window.confirm(
        `Already connected: ${existingInstitutions.join(", ")}. Continue only if you are adding a different institution; use Refresh connection for an existing bank.`,
      )
    ) return;
    setIsPreparing(true);
    try {
      const result = await invokePlaidFunction<LinkTokenResponse>("plaid-create-link-token");
      storeLinkSession({ token: result.link_token, mode: "connect" });
      shouldOpenRef.current = true;
      setReceivedRedirectUri(undefined);
      setLinkToken(result.link_token);
    } catch (caught) {
      toast.error(errorMessage(caught));
      setIsPreparing(false);
    }
  }

  const busy = isPreparing || isExchanging;
  return (
    <Button type="button" onClick={startLink} disabled={busy} size="sm">
      {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
      {isExchanging ? "Finishing" : isPreparing ? "Opening" : "Connect Account"}
    </Button>
  );
}

function PlaidUpdateButton({ plaidItemId, onUpdated, label }: { plaidItemId: string; onUpdated: (summary: SyncSummary) => void; label: string }) {
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [receivedRedirectUri, setReceivedRedirectUri] = useState<string>();
  const [busy, setBusy] = useState(false);
  const shouldOpenRef = useRef(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async () => {
    clearLinkSession();
    cleanOAuthUrl();
    setBusy(true);
    try {
      const result = await invokePlaidFunction<{ sync: SyncSummary }>("plaid-sync-transactions", { plaid_item_id: plaidItemId });
      onUpdated(result.sync);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setBusy(false);
      setLinkToken(null);
    }
  }, [onUpdated, plaidItemId]);

  const onExit = useCallback<PlaidLinkOnExit>((error, metadata) => {
    clearLinkSession();
    shouldOpenRef.current = false;
    setBusy(false);
    const message = plaidExitMessage("update", error, metadata, "Connection refresh was cancelled.");
    if (error) toast.error(message);
  }, []);

  const { open, ready, error } = usePlaidLink({ token: linkToken, onSuccess, onExit, receivedRedirectUri });

  useEffect(() => {
    const stored = readStoredLinkSession();
    const redirectUri = oauthReturnUri();
    if (!stored || stored.mode !== "update" || stored.plaidItemId !== plaidItemId || !redirectUri) return;
    const timeout = window.setTimeout(() => {
      shouldOpenRef.current = true;
      setBusy(true);
      setReceivedRedirectUri(redirectUri);
      setLinkToken(stored.token);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [plaidItemId]);

  useEffect(() => {
    if (!shouldOpenRef.current || !ready) return;
    shouldOpenRef.current = false;
    open();
  }, [open, ready]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => {
      toast.error("Plaid Link could not load. Please try again.");
      clearLinkSession();
      setBusy(false);
      setLinkToken(null);
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [error]);

  async function updateConnection() {
    setBusy(true);
    try {
      const result = await invokePlaidFunction<LinkTokenResponse>("plaid-create-link-token", { plaid_item_id: plaidItemId });
      storeLinkSession({ token: result.link_token, mode: "update", plaidItemId });
      shouldOpenRef.current = true;
      setReceivedRedirectUri(undefined);
      setLinkToken(result.link_token);
    } catch (error) {
      toast.error(errorMessage(error));
      setBusy(false);
    }
  }

  return (
    <Button type="button" variant="outline" size="sm" onClick={updateConnection} disabled={busy}>
      {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}
      {label}
    </Button>
  );
}

export function PlaidAccountActions({
  plaidItemId,
  institutionName,
  status,
}: {
  plaidItemId: string;
  institutionName?: string | null;
  status?: string | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const onUpdated = useCallback((summary: SyncSummary) => {
    toast.success(syncToast(summary));
    router.refresh();
  }, [router]);

  async function sync() {
    setSyncing(true);
    try {
      const result = await invokePlaidFunction<{ sync: SyncSummary }>("plaid-sync-transactions", { plaid_item_id: plaidItemId });
      onUpdated(result.sync);
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    const label = institutionName ?? "this bank";
    if (!window.confirm(`Disconnect ${label}? Transaction and investment history will be kept.`)) return;
    setDisconnecting(true);
    try {
      await invokePlaidFunction("plaid-disconnect-item", { plaid_item_id: plaidItemId });
      toast.success(`${label} disconnected.`);
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setDisconnecting(false);
    }
  }

  return (
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" size="sm" onClick={sync} disabled={syncing || disconnecting}>
        {syncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
        Sync
      </Button>
      <PlaidUpdateButton
        plaidItemId={plaidItemId}
        onUpdated={onUpdated}
        label={status === "login_required" || status === "error" ? "Repair connection" : "Refresh connection"}
      />
      <Button type="button" variant="outline" size="sm" onClick={disconnect} disabled={syncing || disconnecting}>
        {disconnecting ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
        Disconnect
      </Button>
    </div>
  );
}
