import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { checkDuplicateExpense } from "@/actions/duplicate-expenses";
import * as expenseActions from "@/actions/expenses";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { expense } from "../../helpers/fixtures";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));
vi.mock("@/actions/duplicate-expenses", () => ({
  checkDuplicateExpense: vi.fn(),
}));

const saved = {
  description: "Costco",
  spentOn: "2026-10-23",
  amountCents: 8_420,
  scanned: false,
};

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
  vi.mocked(expenseActions.createExpense).mockResolvedValue({ ok: true });
  vi.mocked(expenseActions.updateExpense).mockResolvedValue({ ok: true });
  vi.mocked(checkDuplicateExpense).mockResolvedValue(null);
});

afterEach(() => {
  vi.useRealTimers();
});

const trigger = <button type="button">Open</button>;

async function fillIn(amount = "84.20") {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Description"), "Costco");
  await user.type(within(dialog).getByLabelText("Amount"), amount);
  return { user, dialog };
}

describe("adding an expense that looks like a saved one", () => {
  it("saves straight away when nothing matches", async () => {
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await fillIn();
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledTimes(1),
    );
    expect(checkDuplicateExpense).toHaveBeenCalledWith({
      description: "Costco",
      amount: "84.20",
      spentOn: "2026-10-23",
      category: "Groceries",
    });
    expect(toast.success).toHaveBeenCalledWith("Expense added");
  });

  it("warns first, then saves when the user picks Save anyway", async () => {
    vi.mocked(checkDuplicateExpense).mockResolvedValue(saved);
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await fillIn();
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "This looks like an expense you already saved: Costco, $84.20 on Oct 23, 2026.",
    );
    expect(expenseActions.createExpense).not.toHaveBeenCalled();

    await user.click(
      within(dialog).getByRole("button", { name: "Save anyway" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledTimes(1),
    );
    expect(checkDuplicateExpense).toHaveBeenCalledTimes(1);
    expect(toast.success).toHaveBeenCalledWith("Expense added");
  });

  it("checks again when the details change after a warning", async () => {
    vi.mocked(checkDuplicateExpense).mockResolvedValueOnce(saved);
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await fillIn();
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await within(dialog).findByRole("alert");

    const amount = within(dialog).getByLabelText("Amount");
    await user.clear(amount);
    await user.type(amount, "12.00");
    await user.click(
      within(dialog).getByRole("button", { name: "Save anyway" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledTimes(1),
    );
    expect(checkDuplicateExpense).toHaveBeenCalledTimes(2);
  });

  it("still saves when the check itself fails", async () => {
    vi.mocked(checkDuplicateExpense).mockRejectedValue(new Error("offline"));
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await fillIn();
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledTimes(1),
    );
  });

  it("doesn't check when editing a saved expense", async () => {
    const item = expense();
    renderWithQuery(
      <ExpenseDialog month="2026-10" expense={item} trigger={trigger} />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(expenseActions.updateExpense).toHaveBeenCalledTimes(1),
    );
    expect(checkDuplicateExpense).not.toHaveBeenCalled();
  });
});
