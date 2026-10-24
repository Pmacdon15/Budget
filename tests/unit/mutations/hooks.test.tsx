import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as expenseActions from "@/actions/expenses";
import * as fixedActions from "@/actions/fixed-items";
import * as incomeActions from "@/actions/income";
import type {
  ExpenseFormValues,
  FixedItemFormValues,
  IncomeFormValues,
} from "@/lib/schemas";
import { ActionError } from "@/mutations/action-error";
import { useDeleteExpense, useSaveExpense } from "@/mutations/expenses";
import { useSaveFixedItem, useStopFixedItem } from "@/mutations/fixed-items";
import { useDeleteIncome, useSaveIncome } from "@/mutations/income";

vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));
vi.mock("@/actions/fixed-items", () => ({
  createFixedItem: vi.fn(),
  updateFixedItem: vi.fn(),
  stopFixedItem: vi.fn(),
}));
vi.mock("@/actions/income", () => ({
  createIncome: vi.fn(),
  updateIncome: vi.fn(),
  deleteIncome: vi.fn(),
}));

const OK = { ok: true } as const;
const ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const expenseValues: ExpenseFormValues = {
  description: "Gas",
  category: "Transportation",
  amount: "60",
  spentOn: "2026-10-02",
};
const fixedValues: FixedItemFormValues = {
  name: "Phone",
  category: "Utilities",
  amount: "60",
  dueDay: "",
  month: "2026-10",
};
const incomeValues: IncomeFormValues = {
  label: "Paycheque",
  amount: "2500",
  month: "2026-10",
  receivedOn: "",
};

beforeEach(() => {
  for (const fn of [
    expenseActions.createExpense,
    expenseActions.updateExpense,
    expenseActions.deleteExpense,
    fixedActions.createFixedItem,
    fixedActions.updateFixedItem,
    fixedActions.stopFixedItem,
    incomeActions.createIncome,
    incomeActions.updateIncome,
    incomeActions.deleteIncome,
  ]) {
    vi.mocked(fn).mockResolvedValue(OK);
  }
});

describe("expense mutations", () => {
  it("creates when there is no id", async () => {
    const { result } = renderHook(() => useSaveExpense(), { wrapper });
    await result.current.mutateAsync(expenseValues);
    expect(expenseActions.createExpense).toHaveBeenCalledWith(expenseValues);
    expect(expenseActions.updateExpense).not.toHaveBeenCalled();
  });

  it("updates when given an id", async () => {
    const { result } = renderHook(() => useSaveExpense(ID), { wrapper });
    await result.current.mutateAsync(expenseValues);
    expect(expenseActions.updateExpense).toHaveBeenCalledWith(
      ID,
      expenseValues,
    );
    expect(expenseActions.createExpense).not.toHaveBeenCalled();
  });

  it("deletes by id", async () => {
    const { result } = renderHook(() => useDeleteExpense(), { wrapper });
    await result.current.mutateAsync(ID);
    expect(expenseActions.deleteExpense).toHaveBeenCalledWith(ID);
  });

  it("surfaces a failed action as an ActionError", async () => {
    vi.mocked(expenseActions.createExpense).mockResolvedValue({
      ok: false,
      error: "Pick a date",
      fieldErrors: { spentOn: ["Pick a date"] },
    });
    const { result } = renderHook(() => useSaveExpense(), { wrapper });
    result.current.mutate(expenseValues);
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBeInstanceOf(ActionError);
    expect(result.current.error?.fieldErrors).toEqual({
      spentOn: ["Pick a date"],
    });
  });
});

describe("fixed bill mutations", () => {
  it("creates and updates", async () => {
    const create = renderHook(() => useSaveFixedItem(), { wrapper });
    await create.result.current.mutateAsync(fixedValues);
    expect(fixedActions.createFixedItem).toHaveBeenCalledWith(fixedValues);

    const update = renderHook(() => useSaveFixedItem(ID), { wrapper });
    await update.result.current.mutateAsync(fixedValues);
    expect(fixedActions.updateFixedItem).toHaveBeenCalledWith(ID, fixedValues);
  });

  it("stops a bill from a month", async () => {
    const { result } = renderHook(() => useStopFixedItem(), { wrapper });
    await result.current.mutateAsync({ id: ID, fromMonth: "2026-10" });
    expect(fixedActions.stopFixedItem).toHaveBeenCalledWith(ID, "2026-10");
  });

  it("rejects with the action's message", async () => {
    vi.mocked(fixedActions.stopFixedItem).mockResolvedValue({
      ok: false,
      error: "That item no longer exists.",
    });
    const { result } = renderHook(() => useStopFixedItem(), { wrapper });
    await expect(
      result.current.mutateAsync({ id: ID, fromMonth: "2026-10" }),
    ).rejects.toThrow("That item no longer exists.");
  });
});

describe("take-home mutations", () => {
  it("creates, updates and deletes", async () => {
    const create = renderHook(() => useSaveIncome(), { wrapper });
    await create.result.current.mutateAsync(incomeValues);
    expect(incomeActions.createIncome).toHaveBeenCalledWith(incomeValues);

    const update = renderHook(() => useSaveIncome(ID), { wrapper });
    await update.result.current.mutateAsync(incomeValues);
    expect(incomeActions.updateIncome).toHaveBeenCalledWith(ID, incomeValues);

    const remove = renderHook(() => useDeleteIncome(), { wrapper });
    await remove.result.current.mutateAsync(ID);
    expect(incomeActions.deleteIncome).toHaveBeenCalledWith(ID);
  });
});
