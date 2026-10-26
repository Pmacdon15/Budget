import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as keyActions from "@/actions/api-keys";
import * as pendingActions from "@/actions/pending-expenses";
import { CreateKeyDialog } from "@/components/review/create-key-dialog";
import { PendingActions } from "@/components/review/pending-actions";
import { PendingEditDialog } from "@/components/review/pending-edit-dialog";
import type { PendingExpense } from "@/lib/pending-expenses";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/pending-expenses", () => ({
  approvePendingExpense: vi.fn(),
  editPendingExpense: vi.fn(),
  rejectPendingExpense: vi.fn(),
}));
vi.mock("@/actions/api-keys", () => ({
  createApiKey: vi.fn(),
  revokeApiKey: vi.fn(),
}));

const item: PendingExpense = {
  id: "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10",
  spentOn: "2026-10-20",
  description: "Shell",
  merchant: "Shell",
  category: "Transportation",
  amountCents: 4_567,
  source: "Email",
  client: "Claude",
  createdAt: "2026-10-25T20:00:00.000Z",
  possibleDuplicate: false,
  unpaid: false,
  hasReceipt: false,
};

beforeEach(() => {
  vi.mocked(pendingActions.approvePendingExpense).mockResolvedValue({
    ok: true,
  });
  vi.mocked(pendingActions.editPendingExpense).mockResolvedValue({ ok: true });
  vi.mocked(pendingActions.rejectPendingExpense).mockResolvedValue({
    ok: true,
  });
  vi.mocked(keyActions.createApiKey).mockResolvedValue({
    ok: true,
    key: "bgt_secret-key-shown-once",
  });
});

describe("PendingActions", () => {
  it("approves the item", async () => {
    renderWithQuery(<PendingActions item={item} />);
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Approve" }));
    await waitFor(() =>
      expect(pendingActions.approvePendingExpense).toHaveBeenCalledWith(
        item.id,
      ),
    );
  });

  it("rejects only after confirming", async () => {
    renderWithQuery(<PendingActions item={item} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Actions for Shell" }));
    await user.click(await screen.findByRole("menuitem", { name: "Reject" }));
    const dialog = await screen.findByRole("alertdialog");
    expect(pendingActions.rejectPendingExpense).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole("button", { name: "Reject" }));
    await waitFor(() =>
      expect(pendingActions.rejectPendingExpense).toHaveBeenCalledWith(item.id),
    );
  });
});

describe("PendingEditDialog", () => {
  it("starts from what the AI read and saves the changes", async () => {
    renderWithQuery(
      <PendingEditDialog
        item={item}
        trigger={<button type="button">Edit</button>}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText("Amount");
    expect(amount).toHaveValue("45.67");
    await user.clear(amount);
    await user.type(amount, "50");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(pendingActions.editPendingExpense).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({
          amount: "50",
          description: "Shell",
          spentOn: "2026-10-20",
          category: "Transportation",
        }),
      ),
    );
  });
});

describe("CreateKeyDialog", () => {
  it("creates a named key and shows it once", async () => {
    renderWithQuery(<CreateKeyDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create API key" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText("Name"), "Muse");
    await user.click(
      within(dialog).getByRole("button", { name: "Create key" }),
    );
    expect(
      await within(dialog).findByText("bgt_secret-key-shown-once"),
    ).toBeInTheDocument();
    expect(keyActions.createApiKey).toHaveBeenCalledWith({ name: "Muse" });
    expect(within(dialog).getByText("Copy your key now")).toBeInTheDocument();

    // Closing and reopening never shows it again.
    await user.click(within(dialog).getByRole("button", { name: "Done" }));
    await user.click(screen.getByRole("button", { name: "Create API key" }));
    expect(screen.queryByText("bgt_secret-key-shown-once")).toBeNull();
  });

  it("asks for a name before creating", async () => {
    renderWithQuery(<CreateKeyDialog />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Create API key" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Create key" }),
    );
    expect(
      await within(dialog).findByText("Name the key, like the app it's for"),
    ).toBeInTheDocument();
    expect(keyActions.createApiKey).not.toHaveBeenCalled();
  });
});
