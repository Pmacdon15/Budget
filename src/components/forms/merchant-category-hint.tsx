"use client";

import { History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type Category, categoryLabel } from "@/lib/categories";
import type { MerchantSuggestion } from "@/lib/merchant-memory";

/**
 * Under the expense form's category: says when the category came from what
 * was picked last time for this merchant, and offers it (or the receipt
 * reader's guess) with one tap when the select shows something else.
 */
export function MerchantCategoryHint({
  suggestion,
  current,
  readerGuess,
  onUse,
}: {
  suggestion: MerchantSuggestion | undefined;
  /** The category the select shows now. */
  current: Category;
  /** What the receipt reader guessed, when the form came from a scan. */
  readerGuess?: Category;
  onUse: (category: Category) => void;
}) {
  if (!suggestion) return null;
  const { category, merchant } = suggestion;
  const guess =
    readerGuess && readerGuess !== category && readerGuess !== current
      ? readerGuess
      : undefined;

  return (
    <div
      aria-live="polite"
      className="flex flex-wrap items-center gap-x-1 text-muted-foreground text-xs"
    >
      <History aria-hidden="true" className="size-3.5" />
      {current === category ? (
        <span>Same as last time at {merchant}.</span>
      ) : (
        <>
          <span>
            Last time at {merchant}: {categoryLabel(category)}.
          </span>
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-auto px-0 text-xs"
            onClick={() => onUse(category)}
          >
            Use {categoryLabel(category)}
          </Button>
        </>
      )}
      {guess ? (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="h-auto px-0 text-xs"
          onClick={() => onUse(guess)}
        >
          Use the receipt's guess ({categoryLabel(guess)})
        </Button>
      ) : null}
    </div>
  );
}
