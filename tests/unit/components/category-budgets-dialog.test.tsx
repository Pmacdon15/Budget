import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as budgetActions from "@/actions/category-budgets";
import { CategoryBudgetsDialog } from "@/components/budgets/category-budgets-dialog";
import { CATEGORIES } from "@/lib/categories";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/category-budgets", () => ({
  setCategoryBudgets: vi.fn(),
}));

beforeEach(() => {
  vi.mocked(budgetActions.setCategoryBudgets).mockResolvedValue({ ok: true });
});

const trigger = <button type="button">Open</button>;

async function open(limits = [{ category: "Groceries", limitCents: 60_000 }]) {
  renderWithQuery(
    <CategoryBudgetsDialog month="2026-10" limits={limits} trigger={trigger} />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("CategoryBudgetsDialog", () => {
  it("lists every category by its label, filled with the current limits", async () => {
    const { dialog } = await open();
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Category budgets",
    );
    expect(dialog).toHaveTextContent("from October 2026 onward");
    for (const category of CATEGORIES) {
      expect(within(dialog).getByLabelText(category.label)).toBeInTheDocument();
    }
    expect(within(dialog).getByLabelText("Groceries")).toHaveValue("600.00");
    expect(within(dialog).getByLabelText("Meals & Dining")).toHaveValue("");
  });

  it("saves the limits for the month", async () => {
    const { user, dialog } = await open();
    await user.type(within(dialog).getByLabelText("Meals & Dining"), "250");
    await user.clear(within(dialog).getByLabelText("Groceries"));
    await user.click(
      within(dialog).getByRole("button", { name: "Save budgets" }),
    );

    await waitFor(() =>
      expect(budgetActions.setCategoryBudgets).toHaveBeenCalledTimes(1),
    );
    const values = vi.mocked(budgetActions.setCategoryBudgets).mock
      .calls[0]?.[0] as Record<string, string>;
    expect(values).toMatchObject({
      month: "2026-10",
      limit_Dining: "250",
      limit_Groceries: "",
    });
    await waitFor(() =>
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
    );
    expect(toast.success).toHaveBeenCalledWith("Budgets saved");
  });

  it("shows a bad amount next to its field without saving", async () => {
    const { user, dialog } = await open([]);
    await user.type(within(dialog).getByLabelText("Groceries"), "lots");
    await user.click(
      within(dialog).getByRole("button", { name: "Save budgets" }),
    );
    expect(
      await within(dialog).findByText("Enter a valid amount, like 300.00"),
    ).toBeInTheDocument();
    expect(budgetActions.setCategoryBudgets).not.toHaveBeenCalled();
  });
});
