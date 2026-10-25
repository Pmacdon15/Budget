import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/actions/savings-goals";
import { NavLinks } from "@/components/nav-links";
import { ContributeDialog } from "@/components/savings-goals/contribute-dialog";
import { GoalDialog } from "@/components/savings-goals/goal-dialog";
import type { SavingsGoal } from "@/lib/savings-goals";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/savings-goals", () => ({
  createSavingsGoal: vi.fn(),
  updateSavingsGoal: vi.fn(),
  deleteSavingsGoal: vi.fn(),
  contributeToGoal: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/goals",
  useSearchParams: () => new URLSearchParams("month=2026-04"),
}));

const GOAL: SavingsGoal = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Trip",
  targetCents: 120_000,
  targetDate: "2026-12-31",
  startMonth: "2026-01",
  savedCents: 0,
};

beforeEach(() => {
  for (const fn of Object.values(actions)) {
    vi.mocked(fn).mockResolvedValue({ ok: true });
  }
});

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

const trigger = <button type="button">Open</button>;

describe("GoalDialog", () => {
  it("adds a goal starting in the month being viewed", async () => {
    renderWithQuery(<GoalDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText("Name"), "Trip");
    await user.type(within(dialog).getByLabelText("Target"), "1200");
    await user.click(within(dialog).getByRole("button", { name: "Add goal" }));
    await waitFor(() =>
      expect(actions.createSavingsGoal).toHaveBeenCalledWith({
        month: "2026-10",
        name: "Trip",
        target: "1200",
        targetDate: "",
      }),
    );
  });

  it("edits a goal, keeping its start month", async () => {
    renderWithQuery(
      <GoalDialog month="2026-10" goal={GOAL} trigger={trigger} />,
    );
    const { user, dialog } = await open();
    expect(within(dialog).getByLabelText("Target")).toHaveValue("1200.00");
    await user.click(
      within(dialog).getByRole("button", { name: "Save changes" }),
    );
    await waitFor(() =>
      expect(actions.updateSavingsGoal).toHaveBeenCalledWith(
        GOAL.id,
        expect.objectContaining({ month: "2026-01", name: "Trip" }),
      ),
    );
  });
});

describe("ContributeDialog", () => {
  it("adds money dated in the month being viewed", async () => {
    renderWithQuery(
      <ContributeDialog month="2026-04" goal={GOAL} trigger={trigger} />,
    );
    const { user, dialog } = await open();
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-04-01");
    await user.type(within(dialog).getByLabelText("Amount"), "150");
    await user.click(
      within(dialog).getByRole("button", { name: "Add to goal" }),
    );
    await waitFor(() =>
      expect(actions.contributeToGoal).toHaveBeenCalledWith({
        goalId: GOAL.id,
        amount: "150",
        spentOn: "2026-04-01",
      }),
    );
  });
});

describe("Goals nav link", () => {
  it("keeps the month and marks the page", () => {
    render(<NavLinks />);
    const link = screen.getByRole("link", { name: "Goals" });
    expect(link).toHaveAttribute("href", "/goals?month=2026-04");
    expect(link).toHaveAttribute("aria-current", "page");
  });
});
