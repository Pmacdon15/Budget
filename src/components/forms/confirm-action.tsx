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

/**
 * A confirm dialog that runs a TanStack Query `mutation` with `variables`.
 * `onSuccess` replaces the default success toast (e.g. with one that has Undo).
 */
export function ConfirmAction<TVariables, TData = void>({
  trigger,
  title,
  description,
  confirmLabel,
  successMessage,
  mutation,
  variables,
  onSuccess,
}: {
  trigger: React.ReactElement;
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  mutation: UseMutationResult<TData, ActionError, TVariables>;
  variables: TVariables;
  onSuccess?: (data: TData) => void;
}) {
  const [open, setOpen] = useState(false);
  const pending = mutation.isPending;

  const confirm = () => {
    mutation.mutate(variables, {
      onSuccess: (data) => {
        setOpen(false);
        if (onSuccess) onSuccess(data);
        else toast.success(successMessage);
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
