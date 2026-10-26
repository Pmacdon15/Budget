import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as expenseActions from "@/actions/expenses";
import * as fixedActions from "@/actions/fixed-items";
import * as incomeActions from "@/actions/income";
import * as undoActions from "@/actions/undo";
import { ExpenseActions } from "@/components/expense-actions";
import { FixedItemActions } from "@/components/fixed-item-actions";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { FixedItemDialog } from "@/components/forms/fixed-item-dialog";
import { IncomeDialog } from "@/components/forms/income-dialog";
import { IncomeActions } from "@/components/income-actions";
import { expense, fixedItem, incomeEntry } from "../../helpers/fixtures";
import { renderWithQuery } from "../../helpers/render-with-query";

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
vi.mock("@/actions/undo", () => ({
  deleteExpenseWithUndo: vi.fn(),
  stopFixedItemWithUndo: vi.fn(),
  deleteIncomeWithUndo: vi.fn(),
  undoDelete: vi.fn(),
}));

const UNDO_ID = "0b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b";
const withUndo = expect.objectContaining({
  action: expect.objectContaining({ label: "Undo" }),
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
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
    vi.mocked(fn).mockResolvedValue({ ok: true });
  }
  for (const fn of [
    undoActions.deleteExpenseWithUndo,
    undoActions.stopFixedItemWithUndo,
    undoActions.deleteIncomeWithUndo,
  ]) {
    vi.mocked(fn).mockResolvedValue({ ok: true, undoId: UNDO_ID });
  }
  vi.mocked(undoActions.undoDelete).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
});

const trigger = <button type="button">Open</button>;

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("ExpenseDialog", () => {
  it("adds an expense dated today in the current month", async () => {
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await open();
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Add an expense",
    );
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-23");

    await user.type(within(dialog).getByLabelText("Description"), "Costco");
    await user.type(within(dialog).getByLabelText("Amount"), "84.20");
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );

    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith({
        description: "Costco",
        amount: "84.20",
        spentOn: "2026-10-23",
        category: "Groceries",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Expense added");
  });

  it("defaults to the first of a past month", async () => {
    renderWithQuery(<ExpenseDialog month="2026-04" trigger={trigger} />);
    const { dialog } = await open();
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-04-01");
  });

  it("edits an existing expense", async () => {
    const item = expense({ amountCents: 4_550, category: "Dining" });
    renderWithQuery(
      <ExpenseDialog month="2026-10" expense={item} trigger={trigger} />,
    );
    const { user, dialog } = await open();
    expect(within(dialog).getByLabelText("Description")).toHaveValue(
      "Costco run",
    );
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("45.50");
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-05");

    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(expenseActions.updateExpense).toHaveBeenCalledWith(item.id, {
        description: "Costco run",
        amount: "45.50",
        spentOn: "2026-10-05",
        category: "Dining",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Expense updated");
  });

  it("blocks an invalid amount before it reaches the server", async () => {
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText("Description"), "Gas");
    await user.type(within(dialog).getByLabelText("Amount"), "lots");
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Enter a valid amount, like 1250.00",
    );
    expect(expenseActions.createExpense).not.toHaveBeenCalled();
  });
});

describe("FixedItemDialog", () => {
  it("adds a bill starting in the viewed month", async () => {
    renderWithQuery(<FixedItemDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await open();
    expect(
      within(dialog).getByText("Repeats every month starting October 2026."),
    ).toBeVisible();

    await user.type(within(dialog).getByLabelText("Name"), "Rent");
    await user.type(within(dialog).getByLabelText("Amount / month"), "1500");
    await user.type(within(dialog).getByLabelText("Due day"), "1");
    await user.click(within(dialog).getByRole("button", { name: "Add bill" }));

    await waitFor(() =>
      expect(fixedActions.createFixedItem).toHaveBeenCalledWith({
        month: "2026-10",
        name: "Rent",
        amount: "1500",
        dueDay: "1",
        category: "Housing",
        isEstimate: "off",
        matchKeywords: "",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Bill added");
  });

  it("sends the estimate tick and the names the bill's charges use", async () => {
    renderWithQuery(<FixedItemDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText("Name"), "Google One");
    await user.type(within(dialog).getByLabelText("Amount / month"), "3");
    await user.click(
      within(dialog).getByLabelText("The amount is an estimate"),
    );
    await user.type(
      within(dialog).getByLabelText("Shows up as"),
      "Google Play, Google One",
    );
    await user.click(within(dialog).getByRole("button", { name: "Add bill" }));

    await waitFor(() =>
      expect(fixedActions.createFixedItem).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Google One",
          isEstimate: "on",
          matchKeywords: "Google Play, Google One",
        }),
      ),
    );
  });

  it("explains that edits apply from this month on", async () => {
    const item = fixedItem({ dueDay: null, amountCents: 6_000 });
    renderWithQuery(
      <FixedItemDialog month="2026-10" item={item} trigger={trigger} />,
    );
    const { user, dialog } = await open();
    expect(
      within(dialog).getByText(
        "Changes apply from October 2026 onward. Earlier months keep their old amount.",
      ),
    ).toBeVisible();
    expect(within(dialog).getByLabelText("Due day")).toHaveValue(null);

    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(fixedActions.updateFixedItem).toHaveBeenCalledWith(item.id, {
        month: "2026-10",
        name: "Rent",
        amount: "60.00",
        dueDay: "",
        category: "Housing",
        isEstimate: "off",
        matchKeywords: "",
      }),
    );
  });

  it("rejects an out-of-range due day", async () => {
    renderWithQuery(<FixedItemDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText("Name"), "Rent");
    await user.type(within(dialog).getByLabelText("Amount / month"), "1500");
    await user.type(within(dialog).getByLabelText("Due day"), "40");
    await user.click(within(dialog).getByRole("button", { name: "Add bill" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Due day must be between 1 and 31",
    );
    expect(fixedActions.createFixedItem).not.toHaveBeenCalled();
  });
});

describe("IncomeDialog", () => {
  it("prefills a new entry from the last paycheque", async () => {
    renderWithQuery(
      <IncomeDialog
        month="2026-10"
        suggestion={{ label: "Acme payroll", amountCents: 251_234 }}
        trigger={trigger}
      />,
    );
    const { user, dialog } = await open();
    expect(within(dialog).getByLabelText("Source")).toHaveValue("Acme payroll");
    expect(within(dialog).getByLabelText("Amount (net)")).toHaveValue(
      "2512.34",
    );
    const date = within(dialog).getByLabelText("Received");
    expect(date).toHaveAttribute("min", "2026-10-01");
    expect(date).toHaveAttribute("max", "2026-10-31");

    await user.click(
      within(dialog).getByRole("button", { name: "Add take-home" }),
    );
    await waitFor(() =>
      expect(incomeActions.createIncome).toHaveBeenCalledWith({
        month: "2026-10",
        label: "Acme payroll",
        amount: "2512.34",
        receivedOn: "",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Take-home added");
  });

  it("edits an entry in its own month", async () => {
    const entry = incomeEntry({ month: "2026-02", receivedOn: "2026-02-13" });
    renderWithQuery(
      <IncomeDialog month="2026-10" entry={entry} trigger={trigger} />,
    );
    const { user, dialog } = await open();
    expect(within(dialog).getByText(/February 2026/)).toBeVisible();
    expect(within(dialog).getByLabelText("Received")).toHaveAttribute(
      "max",
      "2026-02-28",
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(incomeActions.updateIncome).toHaveBeenCalledWith(entry.id, {
        month: "2026-02",
        label: "Paycheque",
        amount: "2500.00",
        receivedOn: "2026-02-13",
      }),
    );
  });

  it("starts empty with no suggestion", async () => {
    renderWithQuery(<IncomeDialog month="2026-10" trigger={trigger} />);
    const { dialog } = await open();
    expect(within(dialog).getByLabelText("Source")).toHaveValue("");
    expect(within(dialog).getByLabelText("Amount (net)")).toHaveValue("");
  });
});

describe("row actions", () => {
  async function openMenu(label: string) {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: `Actions for ${label}` }),
    );
    return { user, menu: await screen.findByRole("menu") };
  }

  it("deletes an expense after confirming", async () => {
    const item = expense();
    renderWithQuery(<ExpenseActions expense={item} />);
    const { user, menu } = await openMenu("Costco run");
    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));

    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete this expense?",
    });
    expect(
      within(confirm).getByText("“Costco run” will be removed."),
    ).toBeVisible();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(undoActions.deleteExpenseWithUndo).toHaveBeenCalledWith(item.id),
    );
    expect(toast.success).toHaveBeenCalledWith("Expense deleted", withUndo);
  });

  it("opens the edit dialog for an expense", async () => {
    renderWithQuery(<ExpenseActions expense={expense()} />);
    const { user, menu } = await openMenu("Costco run");
    await user.click(within(menu).getByRole("menuitem", { name: /Edit/ }));
    expect(
      await screen.findByRole("dialog", { name: "Edit expense" }),
    ).toBeVisible();
  });

  it("deletes a take-home entry", async () => {
    const entry = incomeEntry();
    renderWithQuery(<IncomeActions entry={entry} />);
    const { user, menu } = await openMenu("Paycheque");
    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete this take-home entry?",
    });
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(undoActions.deleteIncomeWithUndo).toHaveBeenCalledWith(entry.id),
    );
    expect(toast.success).toHaveBeenCalledWith("Take-home deleted", withUndo);
  });

  it("stops an older bill from the viewed month", async () => {
    const item = fixedItem({ startMonth: "2026-01" });
    renderWithQuery(<FixedItemActions item={item} month="2026-10" />);
    const { user, menu } = await openMenu("Rent");
    await user.click(within(menu).getByRole("menuitem", { name: /Stop/ }));

    const confirm = await screen.findByRole("alertdialog", {
      name: "Stop Rent?",
    });
    expect(
      within(confirm).getByText(
        "It won't count from October 2026 onward. Earlier months and reports stay as they were.",
      ),
    ).toBeVisible();
    await user.click(
      within(confirm).getByRole("button", { name: "Stop bill" }),
    );
    await waitFor(() =>
      expect(undoActions.stopFixedItemWithUndo).toHaveBeenCalledWith(
        item.id,
        "2026-10",
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Bill stopped", withUndo);
  });

  it("deletes a bill that starts in the viewed month", async () => {
    const item = fixedItem({ startMonth: "2026-10" });
    renderWithQuery(<FixedItemActions item={item} month="2026-10" />);
    const { user, menu } = await openMenu("Rent");
    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
    const confirm = await screen.findByRole("alertdialog", {
      name: "Delete Rent?",
    });
    expect(
      within(confirm).getByText("This bill will be removed completely."),
    ).toBeVisible();
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Bill deleted", withUndo),
    );
  });

  async function deleteCostco() {
    renderWithQuery(<ExpenseActions expense={expense()} />);
    const { user, menu } = await openMenu("Costco run");
    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Expense deleted", withUndo),
    );
    const [, options] =
      vi
        .mocked(toast.success)
        .mock.calls.find(([message]) => message === "Expense deleted") ?? [];
    return (options as unknown as { action: { onClick: () => void } }).action;
  }

  it("restores a deleted expense from the toast's Undo", async () => {
    const undo = await deleteCostco();
    undo.onClick();
    await waitFor(() =>
      expect(undoActions.undoDelete).toHaveBeenCalledWith(UNDO_ID),
    );
    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Restored"));
  });

  it("says when Undo is too late", async () => {
    vi.mocked(undoActions.undoDelete).mockResolvedValue({
      ok: false,
      error: "That can't be undone any more.",
    });
    const undo = await deleteCostco();
    undo.onClick();
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That can't be undone any more.",
      ),
    );
  });

  it("shows the error and no Undo when the delete fails", async () => {
    vi.mocked(undoActions.deleteExpenseWithUndo).mockResolvedValue({
      ok: false,
      error: "That item no longer exists.",
    });
    renderWithQuery(<ExpenseActions expense={expense()} />);
    const { user, menu } = await openMenu("Costco run");
    await user.click(within(menu).getByRole("menuitem", { name: /Delete/ }));
    const confirm = await screen.findByRole("alertdialog");
    await user.click(within(confirm).getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That item no longer exists."),
    );
    expect(toast.success).not.toHaveBeenCalled();
  });
});
