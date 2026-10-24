"use client";

import type { UseMutationResult } from "@tanstack/react-query";
import { createContext, use, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
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
import type { FieldErrors } from "@/lib/types";
import type { ActionError } from "@/mutations/action-error";

const FieldErrorsContext = createContext<FieldErrors>({});

/** Shows the validation message for one field; place it inside that field's `Field`. */
export function FieldError({ name }: { name: string }) {
  const message = use(FieldErrorsContext)[name]?.[0];
  if (!message) return null;
  return (
    <p role="alert" className="text-destructive text-xs">
      {message}
    </p>
  );
}

/** Reads a form's string fields into a plain object for Zod. */
function formValues(form: HTMLFormElement) {
  const values: Record<string, string> = {};
  for (const [key, value] of new FormData(form)) {
    if (typeof value === "string") values[key] = value;
  }
  return values;
}

/**
 * A dialog form that validates with `schema` in the browser, then submits the
 * raw values through a TanStack Query `mutation` (which calls a server action
 * that validates them again with the same schema).
 */
export function FormDialog<TSchema extends z.ZodType>({
  trigger,
  title,
  description,
  submitLabel,
  successMessage,
  schema,
  mutation,
  open: controlledOpen,
  onOpenChange,
  children,
}: {
  /** Opens the dialog. Optional when the dialog is opened through `open`. */
  trigger?: React.ReactElement;
  title: string;
  description?: string;
  submitLabel: string;
  successMessage: string;
  schema: TSchema;
  mutation: UseMutationResult<void, ActionError, z.input<TSchema>>;
  /** Controls the dialog from outside, e.g. to open it once a scan finishes. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: React.ReactNode;
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    setUncontrolledOpen(next);
    onOpenChange?.(next);
  };
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const reset = () => {
    setFieldErrors({});
    setFormError(null);
    mutation.reset();
  };

  const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const values = formValues(event.currentTarget);

    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      setFieldErrors(z.flattenError(parsed.error).fieldErrors);
      setFormError(null);
      return;
    }

    setFieldErrors({});
    setFormError(null);
    // Send the raw values: the server action re-parses them with the same schema.
    mutation.mutate(values as z.input<TSchema>, {
      onSuccess: () => {
        setOpen(false);
        reset();
        toast.success(successMessage);
      },
      onError: (error) => {
        setFieldErrors(error.fieldErrors);
        // Field-level problems are shown next to their inputs.
        const hasFieldErrors = Object.keys(error.fieldErrors).length > 0;
        setFormError(hasFieldErrors ? null : error.message);
      },
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      {trigger ? <DialogTrigger render={trigger} /> : null}
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        <FieldErrorsContext value={fieldErrors}>
          <form onSubmit={onSubmit} noValidate className="grid gap-4">
            {children}
            {formError ? (
              <p role="alert" className="text-destructive text-sm">
                {formError}
              </p>
            ) : null}
            <DialogFooter>
              <Button type="submit" disabled={mutation.isPending}>
                {mutation.isPending ? "Saving…" : submitLabel}
              </Button>
            </DialogFooter>
          </form>
        </FieldErrorsContext>
      </DialogContent>
    </Dialog>
  );
}
