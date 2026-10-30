import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as expenseActions from "@/actions/expenses";
import * as pendingActions from "@/actions/pending-expenses";
import { ExpenseDialog } from "@/components/forms/expense-dialog";
import { PendingEditDialog } from "@/components/review/pending-edit-dialog";
import type { ExpenseAccountOption } from "@/lib/expense-accounts";
import type { PendingExpense } from "@/lib/pending-expenses";
import { fetchExpenseAccounts } from "@/queries/expense-accounts";
import { expense } from "../../helpers/fixtures";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));
vi.mock("@/actions/duplicate-expenses", () => ({
  checkDuplicateExpense: vi.fn(async () => null),
}));
vi.mock("@/actions/pending-expenses", () => ({
  approvePendingExpense: vi.fn(),
  editPendingExpense: vi.fn(),
  rejectPendingExpense: vi.fn(),
}));

const CHEQUING: ExpenseAccountOption = {
  id: "0b6f8a8e-4c1d-4b8a-9a0e-1f2d3c4b5a69",
  name: "Chequing",
  type: "chequing",
  institution: "TD",
  lastFour: "9876",
  isPrimary: true,
};
const VISA: ExpenseAccountOption = {
  id: "7d3e2c1b-5a4f-4e3d-8c2b-1a0f9e8d7c6b",
  name: "RBC Visa",
  type: "credit_card",
  institution: "RBC",
  lastFour: "1234",
  isPrimary: false,
};

/** Answers the accounts route (and an empty merchant memory). */
function haveAccounts(accounts: ExpenseAccountOption[]) {
  const fetch = vi.fn(async (url: string) =>
    url === "/api/expense-accounts"
      ? Response.json({ accounts })
      : Response.json({ merchants: {} }),
  );
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.mocked(expenseActions.createExpense).mockResolvedValue({ ok: true });
  vi.mocked(expenseActions.updateExpense).mockResolvedValue({ ok: true });
  vi.mocked(pendingActions.editPendingExpense).mockResolvedValue({
    ok: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const trigger = <button type="button">Open</button>;

async function openForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

async function fillIn(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
) {
  await user.type(within(dialog).getByLabelText("Description"), "Shell");
  await user.type(within(dialog).getByLabelText("Amount"), "45.67");
}

describe("Paid from in the expense form", () => {
  it("isn't shown with one account, and the expense saves without it", async () => {
    haveAccounts([CHEQUING]);
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await openForm();
    await fillIn(user, dialog);
    expect(within(dialog).queryByLabelText("Paid from")).toBeNull();
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalled(),
    );
  });

  it("must be chosen with more than one account: nothing is picked for you", async () => {
    haveAccounts([CHEQUING, VISA]);
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await openForm();
    const picker = await within(dialog).findByLabelText("Paid from");
    expect(picker).toHaveTextContent("Choose an account");
    await fillIn(user, dialog);

    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    expect(
      await within(dialog).findByText("Choose the account this came out of"),
    ).toBeInTheDocument();
    expect(expenseActions.createExpense).not.toHaveBeenCalled();

    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: /RBC Visa/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ description: "Shell", accountId: VISA.id }),
      ),
    );
  });

  it("starts an edit on the expense's account", async () => {
    haveAccounts([CHEQUING, VISA]);
    const item = expense({ accountId: VISA.id });
    renderWithQuery(
      <ExpenseDialog month="2026-10" expense={item} trigger={trigger} />,
    );
    const { user, dialog } = await openForm();
    expect(await within(dialog).findByLabelText("Paid from")).toHaveTextContent(
      "RBC Visa",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(expenseActions.updateExpense).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ accountId: VISA.id }),
      ),
    );
  });

  it("treats an expense with no account as the main chequing account", async () => {
    haveAccounts([CHEQUING, VISA]);
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        expense={expense({ accountId: null })}
        trigger={trigger}
      />,
    );
    const { dialog } = await openForm();
    expect(await within(dialog).findByLabelText("Paid from")).toHaveTextContent(
      "Chequing",
    );
  });
});

describe("Paid from when editing an AI item", () => {
  const item: PendingExpense = {
    id: "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10",
    spentOn: "2026-10-20",
    description: "Shell",
    merchant: "Shell",
    category: "Transportation",
    amountCents: 4_567,
    source: null,
    client: "Claude",
    createdAt: "2026-10-21T15:00:00.000Z",
    possibleDuplicate: false,
    unpaid: false,
    hasReceipt: false,
    accountId: null,
    accountName: null,
  };

  it("asks for the account the AI didn't confirm", async () => {
    haveAccounts([CHEQUING, VISA]);
    renderWithQuery(
      <PendingEditDialog
        item={item}
        trigger={<button type="button">Open</button>}
      />,
    );
    const { user, dialog } = await openForm();
    const picker = await within(dialog).findByLabelText("Paid from");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    expect(
      await within(dialog).findByText("Choose the account this came out of"),
    ).toBeInTheDocument();
    expect(pendingActions.editPendingExpense).not.toHaveBeenCalled();

    await user.click(picker);
    await user.click(await screen.findByRole("option", { name: /Chequing/ }));
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(pendingActions.editPendingExpense).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ accountId: CHEQUING.id }),
      ),
    );
  });
});

describe("fetchExpenseAccounts", () => {
  it("returns the accounts", async () => {
    haveAccounts([CHEQUING, VISA]);
    expect(await fetchExpenseAccounts()).toEqual([CHEQUING, VISA]);
  });

  it("treats any failure as no accounts, so the server decides", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    expect(await fetchExpenseAccounts()).toEqual([]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("offline");
      }),
    );
    expect(await fetchExpenseAccounts()).toEqual([]);
  });
});
