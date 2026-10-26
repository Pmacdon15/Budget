import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/actions/bank-balance";
import { BankBalanceDialog } from "@/components/bank-balance/bank-balance-dialog";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/bank-balance", () => ({
  setBankBalance: vi.fn(),
  clearBankBalance: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(actions.setBankBalance).mockResolvedValue({ ok: true });
  vi.mocked(actions.clearBankBalance).mockResolvedValue({ ok: true });
});

const trigger = <button type="button">Open</button>;

async function open(
  balance: Parameters<typeof BankBalanceDialog>[0]["balance"] = null,
) {
  renderWithQuery(<BankBalanceDialog balance={balance} trigger={trigger} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog");
  return {
    user,
    dialog,
    input: within(dialog).getByLabelText("Current balance"),
    save: within(dialog).getByRole("button", { name: "Save balance" }),
  };
}

describe("BankBalanceDialog", () => {
  it("saves a positive balance", async () => {
    const { user, input, save } = await open();
    await user.type(input, "1250.50");
    await user.click(save);
    await waitFor(() =>
      expect(actions.setBankBalance).toHaveBeenCalledWith({
        balance: "1250.50",
      }),
    );
  });

  it("accepts a typed minus for an overdrawn balance", async () => {
    const { user, input, save } = await open();
    await user.type(input, "-75");
    await user.click(save);
    await waitFor(() =>
      expect(actions.setBankBalance).toHaveBeenCalledWith({ balance: "-75" }),
    );
  });

  it("flips the sign with the ± button, for keypads with no minus", async () => {
    const { user, dialog, input, save } = await open();
    await user.type(input, "40");
    const toggle = within(dialog).getByRole("button", {
      name: "Make it negative (overdrawn)",
    });
    await user.click(toggle);
    expect(input).toHaveValue("-40");
    expect(
      within(dialog).getByRole("button", { name: "Make it positive" }),
    ).toHaveAttribute("aria-pressed", "true");
    await user.click(save);
    await waitFor(() =>
      expect(actions.setBankBalance).toHaveBeenCalledWith({ balance: "-40" }),
    );
  });

  it("flips back to positive", async () => {
    const { user, dialog, input } = await open();
    await user.type(input, "-12.50");
    await user.click(
      within(dialog).getByRole("button", { name: "Make it positive" }),
    );
    expect(input).toHaveValue("12.50");
  });

  it("starts from the saved balance, keeping its minus", async () => {
    const { input } = await open({
      accountId: "00000000-0000-4000-8000-000000000001",
      accountName: "Chequing",
      transfersSinceCents: 0,
      balanceCents: -12_345,
      enteredCents: -12_345,
      spentSinceCents: 0,
      updatedAt: "2026-10-25T20:52:00.000Z",
    });
    expect(input).toHaveValue("-123.45");
    expect(screen.getByText("Update bank balance")).toBeInTheDocument();
  });

  it("shows a hint for an amount it can't read, without saving", async () => {
    const { user, dialog, input, save } = await open();
    await user.type(input, "--5");
    await user.click(save);
    expect(
      await within(dialog).findByText(
        "Enter your balance, like 1250.00, or -75.00 if overdrawn",
      ),
    ).toBeInTheDocument();
    expect(actions.setBankBalance).not.toHaveBeenCalled();
  });
});
