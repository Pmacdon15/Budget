import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import * as undoActions from "@/actions/undo";
import { ActionError } from "@/mutations/action-error";
import {
  useDeleteExpenseWithUndo,
  useDeleteIncomeWithUndo,
  useStopFixedItemWithUndo,
  useUndoDelete,
} from "@/mutations/undo";

vi.mock("@/actions/undo", () => ({
  deleteExpenseWithUndo: vi.fn(),
  stopFixedItemWithUndo: vi.fn(),
  deleteIncomeWithUndo: vi.fn(),
  undoDelete: vi.fn(),
}));

const ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";
const UNDO_ID = "0b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b";
const UNDOABLE = { ok: true, undoId: UNDO_ID } as const;
const FAILED = { ok: false, error: "That item no longer exists." } as const;

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("undoable deletes", () => {
  it("resolve to the undo id", async () => {
    vi.mocked(undoActions.deleteExpenseWithUndo).mockResolvedValue(UNDOABLE);
    vi.mocked(undoActions.stopFixedItemWithUndo).mockResolvedValue(UNDOABLE);
    vi.mocked(undoActions.deleteIncomeWithUndo).mockResolvedValue(UNDOABLE);

    const expense = renderHook(() => useDeleteExpenseWithUndo(), { wrapper });
    expect(await expense.result.current.mutateAsync(ID)).toBe(UNDO_ID);
    expect(undoActions.deleteExpenseWithUndo).toHaveBeenCalledWith(ID);

    const bill = renderHook(() => useStopFixedItemWithUndo(), { wrapper });
    expect(
      await bill.result.current.mutateAsync({ id: ID, fromMonth: "2026-10" }),
    ).toBe(UNDO_ID);
    expect(undoActions.stopFixedItemWithUndo).toHaveBeenCalledWith(
      ID,
      "2026-10",
    );

    const income = renderHook(() => useDeleteIncomeWithUndo(), { wrapper });
    expect(await income.result.current.mutateAsync(ID)).toBe(UNDO_ID);
    expect(undoActions.deleteIncomeWithUndo).toHaveBeenCalledWith(ID);
  });

  it("throw the action's error", async () => {
    vi.mocked(undoActions.deleteExpenseWithUndo).mockResolvedValue(FAILED);
    const { result } = renderHook(() => useDeleteExpenseWithUndo(), {
      wrapper,
    });
    const error = await result.current.mutateAsync(ID).catch((e) => e);
    expect(error).toBeInstanceOf(ActionError);
    expect(error.message).toBe("That item no longer exists.");
  });
});

describe("useUndoDelete", () => {
  it("sends the undo id back", async () => {
    vi.mocked(undoActions.undoDelete).mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useUndoDelete(), { wrapper });
    await result.current.mutateAsync(UNDO_ID);
    expect(undoActions.undoDelete).toHaveBeenCalledWith(UNDO_ID);
  });

  it("throws when it is too late", async () => {
    vi.mocked(undoActions.undoDelete).mockResolvedValue({
      ok: false,
      error: "That can't be undone any more.",
    });
    const { result } = renderHook(() => useUndoDelete(), { wrapper });
    await expect(result.current.mutateAsync(UNDO_ID)).rejects.toThrow(
      "That can't be undone any more.",
    );
  });
});
