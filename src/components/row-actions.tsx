"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

/** One more item in the menu, between Edit and Delete, that opens its own dialog. */
export type RowAction = {
  label: string;
  icon: React.ReactNode;
  render: (trigger: React.ReactElement) => React.ReactNode;
};

/**
 * A "⋯" menu with Edit / Delete (plus an optional `extra` action). The dialogs are rendered outside the menu and opened
 * programmatically via hidden triggers, so closing the menu doesn't unmount them.
 */
export function RowActions({
  label,
  deleteLabel = "Delete",
  renderEdit,
  renderDelete,
  extra,
}: {
  label: string;
  deleteLabel?: string;
  renderEdit: (trigger: React.ReactElement) => React.ReactNode;
  renderDelete: (trigger: React.ReactElement) => React.ReactNode;
  extra?: RowAction;
}) {
  const [editTrigger, setEditTrigger] = useState<HTMLButtonElement | null>(
    null,
  );
  const [deleteTrigger, setDeleteTrigger] = useState<HTMLButtonElement | null>(
    null,
  );
  const [extraTrigger, setExtraTrigger] = useState<HTMLButtonElement | null>(
    null,
  );

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Actions for ${label}`}
            >
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => editTrigger?.click()}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {extra ? (
            <DropdownMenuItem onClick={() => extraTrigger?.click()}>
              {extra.icon} {extra.label}
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem
            variant="destructive"
            onClick={() => deleteTrigger?.click()}
          >
            <Trash2 /> {deleteLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renderEdit(
        <button
          type="button"
          ref={setEditTrigger}
          className="hidden"
          tabIndex={-1}
        />,
      )}
      {extra?.render(
        <button
          type="button"
          ref={setExtraTrigger}
          className="hidden"
          tabIndex={-1}
        />,
      )}
      {renderDelete(
        <button
          type="button"
          ref={setDeleteTrigger}
          className="hidden"
          tabIndex={-1}
        />,
      )}
    </>
  );
}
