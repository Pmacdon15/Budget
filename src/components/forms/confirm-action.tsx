"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import type { ActionError } from "@/mutations/action-error";

/** A confirm dialog that runs a TanStack Query `mutation` with `variables`. */
export function ConfirmAction<TVariables>({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  mutation,
  variables,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  mutation: UseMutationResult<void, ActionError, TVariables>;
  variables: TVariables;
}) {
  const [open, setOpen] = useState(false);
  const pending = mutation.isPending;

  const confirm = () => {
    mutation.mutate(variables, {
      onSuccess: () => {
        setOpen(false);
        toast.success(successMessage);
      },
      onError: (error) => toast.error(error.message),
    });
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger render={trigger} />
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <Button variant="destructive" onClick={confirm} disabled={pending}>
            {pending ? "Working…" : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
