"use client";

import { useActionState, useEffect } from "react";
import { toast } from "sonner";
import { RefreshCw } from "lucide-react";
import { syncZohoAction } from "@/app/actions/zoho";
import type { ActionState } from "@/app/actions/clients";
import { Button } from "@/components/ui/form";

export function ZohoSyncButton() {
  const [state, action, pending] = useActionState<ActionState, FormData>(syncZohoAction, {});

  useEffect(() => {
    if (state.ok) toast.success(state.ok, { duration: 9000 });
    if (state.error) toast.error(state.error, { duration: 9000 });
  }, [state]);

  return (
    <form action={action}>
      <Button type="submit" loading={pending} size="sm" title="Pull invoices from Zoho Books">
        {!pending && <RefreshCw size={13} />}
        Sync Zoho
      </Button>
    </form>
  );
}
