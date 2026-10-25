import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExpenseSearchForm } from "@/components/expense-search/expense-search-form";
import { EMPTY_SEARCH } from "@/lib/schemas/expense-search";

const nav = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  usePathname: () => "/expenses",
  useRouter: () => ({ replace: nav.replace }),
}));

beforeEach(() => {
  window.history.replaceState(null, "", "/expenses?month=2026-09");
});

describe("ExpenseSearchForm", () => {
  it("puts the search in the URL, keeping the month", async () => {
    const user = userEvent.setup();
    render(<ExpenseSearchForm />);

    await user.type(
      screen.getByRole("searchbox", { name: "Search description or merchant" }),
      "costco",
    );
    await user.type(
      screen.getByRole("textbox", { name: "Minimum amount" }),
      "20",
    );
    await user.click(screen.getByRole("button", { name: "Search" }));

    expect(nav.replace).toHaveBeenCalledWith(
      "/expenses?month=2026-09&q=costco&min=20",
      { scroll: false },
    );
  });

  it("shows the current search and clears it", async () => {
    const user = userEvent.setup();
    window.history.replaceState(null, "", "/expenses?q=gas&category=Auto");
    render(
      <ExpenseSearchForm
        search={{
          ...EMPTY_SEARCH,
          q: "gas",
          category: "Auto",
          maxCents: 5_000,
        }}
      />,
    );

    expect(
      screen.getByRole("searchbox", { name: "Search description or merchant" }),
    ).toHaveValue("gas");
    expect(screen.getByRole("textbox", { name: "Maximum amount" })).toHaveValue(
      "50.00",
    );
    expect(
      screen.getByRole("combobox", { name: "Category" }),
    ).toHaveTextContent("Motor Vehicle");

    await user.click(screen.getByRole("button", { name: "Clear" }));
    expect(nav.replace).toHaveBeenCalledWith("/expenses", { scroll: false });
  });

  it("has no Clear button without a search", () => {
    render(<ExpenseSearchForm />);
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });

  it("is a disabled placeholder in the static shell", () => {
    render(<ExpenseSearchForm disabled />);
    expect(
      screen.getByRole("searchbox", { name: "Search description or merchant" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Search" })).toBeDisabled();
  });
});
