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

/**
 * A "⋯" menu with Edit / Delete. The dialogs are rendered outside the menu and opened
 * programmatically via hidden triggers, so closing the menu doesn't unmount them.
 */
export function RowActions({
  label,
  deleteLabel = "Delete",
  renderEdit,
  renderDelete,
}: {
  label: string;
  deleteLabel?: string;
  renderEdit: (trigger: React.ReactElement) => React.ReactNode;
  renderDelete: (trigger: React.ReactElement) => React.ReactNode;
}) {
  const [editTrigger, setEditTrigger] = useState<HTMLButtonElement | null>(null);
  const [deleteTrigger, setDeleteTrigger] = useState<HTMLButtonElement | null>(null);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button variant="ghost" size="icon-sm" aria-label={`Actions for ${label}`}>
              <MoreHorizontal />
            </Button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => editTrigger?.click()}>
            <Pencil /> Edit
          </DropdownMenuItem>
          <DropdownMenuItem variant="destructive" onClick={() => deleteTrigger?.click()}>
            <Trash2 /> {deleteLabel}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {renderEdit(<button type="button" ref={setEditTrigger} className="hidden" tabIndex={-1} />)}
      {renderDelete(
        <button type="button" ref={setDeleteTrigger} className="hidden" tabIndex={-1} />,
      )}
    </>
  );
}
