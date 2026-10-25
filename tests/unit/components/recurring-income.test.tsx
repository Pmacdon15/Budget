import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/actions/recurring-income";
import { RecurringIncomeDialog } from "@/components/recurring-income/recurring-income-dialog";
import { RecurringIncomeRow } from "@/components/recurring-income/recurring-income-row";
import type { RecurringIncomeForMonth } from "@/lib/recurring-income";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/recurring-income", () => ({
  createRecurringIncome: vi.fn(),
  updateRecurringIncome: vi.fn(),
  stopRecurringIncome: vi.fn(),
  recordRecurringIncome: vi.fn(),
  skipRecurringIncome: vi.fn(),
  unskipRecurringIncome: vi.fn(),
}));

const ID = "11111111-1111-4111-8111-111111111111";

const item = (
  status: RecurringIncomeForMonth["status"] = { state: "expected" },
): RecurringIncomeForMonth => ({
  id: ID,
  label: "Paycheque",
  amountCents: 250_000,
  startMonth: "2026-09",
  endMonth: null,
  status,
});

beforeEach(() => {
  for (const fn of Object.values(actions)) {
    vi.mocked(fn).mockResolvedValue({ ok: true });
  }
});

const row = (status?: RecurringIncomeForMonth["status"]) =>
  renderWithQuery(
    <ul>
      <RecurringIncomeRow month="2026-10" item={item(status)} />
    </ul>,
  );

describe("RecurringIncomeRow", () => {
  it("adds the usual amount in one tap", async () => {
    row();
    await userEvent.click(
      screen.getByRole("button", { name: "Add $2,500.00" }),
    );
    await waitFor(() =>
      expect(actions.recordRecurringIncome).toHaveBeenCalledWith({
        recurringId: ID,
        month: "2026-10",
        amount: "2500.00",
        receivedOn: "",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Take-home added");
  });

  it("adds a different amount for this month", async () => {
    row();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Different amount" }));
    const dialog = await screen.findByRole("dialog");
    const amount = within(dialog).getByLabelText("Amount (net)");
    expect(amount).toHaveValue("2500.00");
    await user.clear(amount);
    await user.type(amount, "2310.45");
    await user.click(
      within(dialog).getByRole("button", { name: "Add take-home" }),
    );
    await waitFor(() =>
      expect(actions.recordRecurringIncome).toHaveBeenCalledWith(
        expect.objectContaining({
          recurringId: ID,
          month: "2026-10",
          amount: "2310.45",
        }),
      ),
    );
  });

  it("skips the month, and undoes a skip", async () => {
    const { unmount } = row();
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    await waitFor(() =>
      expect(actions.skipRecurringIncome).toHaveBeenCalledWith({
        recurringId: ID,
        month: "2026-10",
      }),
    );
    unmount();

    row({ state: "skipped" });
    expect(
      screen.queryByRole("button", { name: "Add $2,500.00" }),
    ).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Undo skip" }));
    await waitFor(() =>
      expect(actions.unskipRecurringIncome).toHaveBeenCalledWith({
        recurringId: ID,
        month: "2026-10",
      }),
    );
  });

  it("shows an added month without the add buttons", () => {
    row({ state: "added", amountCents: 231_045 });
    expect(
      screen.getByText("Added $2,310.45 · usually $2,500.00"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Skip" }),
    ).not.toBeInTheDocument();
  });

  it("shows an error from the server", async () => {
    vi.mocked(actions.recordRecurringIncome).mockResolvedValue({
      ok: false,
      error: "That paycheque was already added for this month.",
      fieldErrors: {},
    });
    row();
    await userEvent.click(
      screen.getByRole("button", { name: "Add $2,500.00" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "That paycheque was already added for this month.",
      ),
    );
  });
});

describe("RecurringIncomeDialog", () => {
  it("starts a repeating paycheque, prefilled from the last one", async () => {
    renderWithQuery(
      <RecurringIncomeDialog
        month="2026-10"
        suggestion={{ label: "Paycheque", amountCents: 240_000 }}
        trigger={<button type="button">Open</button>}
      />,
    );
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Open" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Expected every month from October 2026");
    expect(within(dialog).getByLabelText("Source")).toHaveValue("Paycheque");
    expect(within(dialog).getByLabelText("Usual amount (net)")).toHaveValue(
      "2400.00",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Start repeating" }),
    );
    await waitFor(() =>
      expect(actions.createRecurringIncome).toHaveBeenCalledWith({
        month: "2026-10",
        label: "Paycheque",
        amount: "2400.00",
      }),
    );
  });
});
