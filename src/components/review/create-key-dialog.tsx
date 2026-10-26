"use client";

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { Field } from "@/components/forms/fields";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { apiKeyNameSchema } from "@/lib/api-keys";
import { useCreateApiKey } from "@/mutations/api-keys";
import { CopyButton } from "./copy-button";

/**
 * Names and creates a personal API key, then shows it once: only its hash is
 * kept, so it can't be shown again.
 */
export function CreateKeyDialog() {
  const mutation = useCreateApiKey();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    setKey(null);
    setError(null);
    mutation.reset();
  };

  // Every way of closing forgets the key, so reopening never shows it again.
  const changeOpen = (next: boolean) => {
    setOpen(next);
    if (!next) reset();
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "");
    const parsed = apiKeyNameSchema.safeParse({ name });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Name the key");
      return;
    }
    setError(null);
    mutation.mutate(
      { name },
      {
        onSuccess: (created) => setKey(created),
        onError: (failure) => setError(failure.message),
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <KeyRound /> Create API key
          </Button>
        }
      />
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {key ? "Copy your key now" : "Create an API key"}
          </DialogTitle>
          <DialogDescription>
            {key
              ? "This is the only time it's shown. Paste it into your AI app with the connector URL. Anyone with it can add expenses for review and change your spending, so keep it private."
              : "For AI apps that can't sign in with your Budget account. You can revoke it any time."}
          </DialogDescription>
        </DialogHeader>
        {key ? (
          <div className="grid gap-4">
            <div className="flex items-center gap-2">
              <code className="min-w-0 flex-1 break-all rounded-md bg-muted px-2 py-1.5 text-xs">
                {key}
              </code>
              <CopyButton value={key} label="Copy key" />
            </div>
            <DialogFooter>
              <Button onClick={() => changeOpen(false)}>Done</Button>
            </DialogFooter>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            <Field label="Name" htmlFor="api-key-name" hint="e.g. Muse">
              <Input id="api-key-name" name="name" autoFocus required />
            </Field>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                Create key
              </Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
