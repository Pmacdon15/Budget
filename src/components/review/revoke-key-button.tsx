"use client";

import { ConfirmAction } from "@/components/forms/confirm-action";
import { Button } from "@/components/ui/button";
import type { ApiKey } from "@/lib/api-keys";
import { useRevokeApiKey } from "@/mutations/api-keys";

export function RevokeKeyButton({ apiKey }: { apiKey: ApiKey }) {
  const revoke = useRevokeApiKey();
  return (
    <ConfirmAction
      trigger={
        <Button size="sm" variant="ghost">
          Revoke
        </Button>
      }
      title="Revoke this key?"
      description={`Apps using “${apiKey.name}” lose access to Budget straight away.`}
      confirmLabel="Revoke"
      successMessage="Key revoked"
      mutation={revoke}
      variables={apiKey.id}
    />
  );
}
