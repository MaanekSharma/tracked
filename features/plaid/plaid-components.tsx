"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Link2, Loader2, RefreshCw, Unlink } from "lucide-react";
import { useRouter } from "next/navigation";
import { type PlaidLinkOnExit, type PlaidLinkOnSuccess, usePlaidLink } from "react-plaid-link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invokePlaidFunction } from "@/features/plaid/plaid-client";

type LinkTokenResponse = {
  link_token: string;
};

type ExchangeResponse = {
  institution_name?: string | null;
  sync?: {
    added: number;
    modified: number;
    removed: number;
  };
};

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unable to complete the bank connection request.";
}

export function PlaidConnectButton() {
  const router = useRouter();
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isExchanging, setIsExchanging] = useState(false);
  const shouldOpenRef = useRef(false);

  const onSuccess = useCallback<PlaidLinkOnSuccess>(
    async (publicToken, metadata) => {
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
        toast.success(`${result.institution_name ?? "Bank"} connected${imported ? ` with ${imported} transactions synced` : ""}.`);
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

  const onExit = useCallback<PlaidLinkOnExit>((error) => {
    shouldOpenRef.current = false;
    setIsPreparing(false);
    if (error) {
      toast.error(error.display_message ?? error.error_message ?? "Bank connection was cancelled.");
    }
  }, []);

  const { open, ready, error } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit,
  });

  useEffect(() => {
    if (!shouldOpenRef.current || !ready) return;
    shouldOpenRef.current = false;
    open();
  }, [open, ready]);

  useEffect(() => {
    if (!error) return;
    const timeout = window.setTimeout(() => {
      toast.error("Plaid Link could not load. Please try again.");
      shouldOpenRef.current = false;
      setIsPreparing(false);
      setLinkToken(null);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [error]);

  async function startLink() {
    setIsPreparing(true);
    try {
      const result = await invokePlaidFunction<LinkTokenResponse>("plaid-create-link-token");
      shouldOpenRef.current = true;
      setLinkToken(result.link_token);
    } catch (error) {
      toast.error(errorMessage(error));
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

export function PlaidAccountActions({
  plaidItemId,
  institutionName,
}: {
  plaidItemId: string;
  institutionName?: string | null;
}) {
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  async function sync() {
    setSyncing(true);
    try {
      const result = await invokePlaidFunction<{ sync: { added: number; modified: number; removed: number } }>("plaid-sync-transactions", {
        plaid_item_id: plaidItemId,
      });
      const changed = result.sync.added + result.sync.modified + result.sync.removed;
      toast.success(changed ? `Synced ${changed} transaction updates.` : "Everything is up to date.");
      router.refresh();
    } catch (error) {
      toast.error(errorMessage(error));
    } finally {
      setSyncing(false);
    }
  }

  async function disconnect() {
    const label = institutionName ?? "this bank";
    if (!window.confirm(`Disconnect ${label}? Transaction history will be kept.`)) return;

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
      <Button type="button" variant="outline" size="sm" onClick={disconnect} disabled={syncing || disconnecting}>
        {disconnecting ? <Loader2 className="size-4 animate-spin" /> : <Unlink className="size-4" />}
        Disconnect
      </Button>
    </div>
  );
}
