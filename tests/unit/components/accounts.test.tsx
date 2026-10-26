import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/actions/accounts";
import { AccountDialog } from "@/components/accounts/account-dialog";
import type { Account } from "@/lib/accounts";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/accounts", () => ({
  createAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  createTransfer: vi.fn(),
  deleteTransfer: vi.fn(),
  approvePendingAccount: vi.fn(),
  rejectPendingAccount: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(actions.createAccount).mockResolvedValue({ ok: true });
  vi.mocked(actions.updateAccount).mockResolvedValue({ ok: true });
});

const trigger = <button type="button">Open</button>;

const visa: Account = {
  id: "00000000-0000-4000-8000-000000000001",
  type: "credit_card",
  name: "Visa",
  institution: "RBC",
  lastFour: "1234",
  isPrimary: false,
  balanceCents: 84_219,
  enteredCents: 84_219,
  spentSinceCents: 0,
  transfersSinceCents: 0,
  balanceAsOf: "2026-10-16T06:00:00.000Z",
  balanceSource: "statement",
  creditLimitCents: 500_000,
  availableCreditCents: null,
  statementBalanceCents: 84_219,
  statementClosingDate: "2026-10-15",
  paymentDueDate: "2026-11-08",
  minimumPaymentCents: 2_500,
  createdAt: "2026-10-01T00:00:00.000Z",
};

async function open(account?: Account) {
  renderWithQuery(<AccountDialog account={account} trigger={trigger} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

describe("AccountDialog", () => {
  it("adds a chequing account, without credit card fields", async () => {
    const { user, dialog } = await open();
    expect(within(dialog).queryByLabelText("Credit limit")).toBeNull();
    await user.type(within(dialog).getByLabelText("Name"), "Everyday");
    await user.type(within(dialog).getByLabelText("Last four digits"), "9876");
    await user.type(within(dialog).getByLabelText("Current balance"), "-75");
    await user.click(
      within(dialog).getByRole("button", { name: "Add account" }),
    );
    await waitFor(() =>
      expect(actions.createAccount).toHaveBeenCalledWith(
        expect.objectContaining({
          name: "Everyday",
          type: "chequing",
          lastFour: "9876",
          balance: "-75",
        }),
      ),
    );
  });

  it("edits a credit card with its details filled in", async () => {
    const { user, dialog } = await open(visa);
    expect(within(dialog).getByLabelText("Balance owed")).toHaveValue("842.19");
    expect(within(dialog).getByLabelText("Credit limit")).toHaveValue(
      "5000.00",
    );
    expect(within(dialog).getByLabelText("Minimum payment")).toHaveValue(
      "25.00",
    );
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "RBC Visa");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(actions.updateAccount).toHaveBeenCalledWith(
        visa.id,
        expect.objectContaining({ name: "RBC Visa", type: "credit_card" }),
      ),
    );
  });

  it("shows a bad last four next to the field without saving", async () => {
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText("Name"), "Everyday");
    await user.type(within(dialog).getByLabelText("Last four digits"), "12");
    await user.type(within(dialog).getByLabelText("Current balance"), "10");
    await user.click(
      within(dialog).getByRole("button", { name: "Add account" }),
    );
    expect(
      await within(dialog).findByText("Enter the last four digits, like 1234"),
    ).toBeInTheDocument();
    expect(actions.createAccount).not.toHaveBeenCalled();
  });
});
