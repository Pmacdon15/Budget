"use client";

import { MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
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
 * A "⋯" menu with Edit / Delete (plus optional `extra` actions). The dialogs are rendered outside the menu and opened
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
  /** One action, or several, shown in order between Edit and Delete. */
  extra?: RowAction | RowAction[];
}) {
  const extras = extra ? (Array.isArray(extra) ? extra : [extra]) : [];
  const [editTrigger, setEditTrigger] = useState<HTMLButtonElement | null>(
    null,
  );
  const [deleteTrigger, setDeleteTrigger] = useState<HTMLButtonElement | null>(
    null,
  );
  // Read at click time, so a ref (not state) is enough for each extra.
  const extraTriggers = useRef<(HTMLButtonElement | null)[]>([]);

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
          {extras.map((action, index) => (
            <DropdownMenuItem
              key={action.label}
              onClick={() => extraTriggers.current[index]?.click()}
            >
              {action.icon} {action.label}
            </DropdownMenuItem>
          ))}
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
      {extras.map((action, index) => (
        <span key={action.label} className="contents">
          {action.render(
            <button
              type="button"
              ref={(node) => {
                extraTriggers.current[index] = node;
              }}
              className="hidden"
              tabIndex={-1}
            />,
          )}
        </span>
      ))}
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
