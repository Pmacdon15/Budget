import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonthSwitcher } from "@/components/month-switcher";
import { NavLinks } from "@/components/nav-links";
import { ThemeToggle } from "@/components/theme-toggle";

const nav = vi.hoisted(() => ({
  pathname: "/",
  search: "",
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(nav.search),
  useRouter: () => ({ push: nav.push }),
}));

const theme = vi.hoisted(() => ({ resolvedTheme: "light", setTheme: vi.fn() }));
vi.mock("next-themes", () => ({ useTheme: () => theme }));

beforeEach(() => {
  nav.pathname = "/";
  nav.search = "";
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("NavLinks", () => {
  it("links every section and marks the current one", () => {
    nav.pathname = "/income";
    render(<NavLinks />);
    for (const name of [
      "Overview",
      "Fixed bills",
      "Take-home",
      "Spending",
      "Report",
    ]) {
      expect(screen.getByRole("link", { name })).toBeInTheDocument();
    }
    expect(screen.getByRole("link", { name: "Take-home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Overview" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("only marks Overview on the home page itself", () => {
    nav.pathname = "/";
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Overview" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(screen.getByRole("link", { name: "Report" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("keeps the selected month when switching sections", () => {
    nav.search = "month=2026-04";
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Spending" })).toHaveAttribute(
      "href",
      "/expenses?month=2026-04",
    );
  });

  it("uses plain links when no month is selected", () => {
    render(<NavLinks />);
    expect(screen.getByRole("link", { name: "Report" })).toHaveAttribute(
      "href",
      "/report",
    );
  });
});

describe("MonthSwitcher", () => {
  it("shows the current month by default", () => {
    render(<MonthSwitcher />);
    expect(
      screen.getByRole("button", { name: /October 2026/ }),
    ).toHaveAttribute("title", "Current month");
  });

  it("moves to the previous and next month", async () => {
    const user = userEvent.setup();
    nav.pathname = "/expenses";
    render(<MonthSwitcher />);
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(nav.push).toHaveBeenLastCalledWith("/expenses?month=2026-09");
    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(nav.push).toHaveBeenLastCalledWith("/expenses?month=2026-11");
  });

  it("drops ?month= when returning to the current month", async () => {
    const user = userEvent.setup();
    nav.pathname = "/report";
    nav.search = "month=2026-09&tab=summary";
    render(<MonthSwitcher />);
    expect(
      screen.getByRole("button", { name: /September 2026/ }),
    ).toHaveAttribute("title", "Jump to current month");

    await user.click(screen.getByRole("button", { name: "Next month" }));
    expect(nav.push).toHaveBeenLastCalledWith("/report?tab=summary");

    await user.click(screen.getByRole("button", { name: /September 2026/ }));
    expect(nav.push).toHaveBeenLastCalledWith("/report?tab=summary");
  });

  it("goes to the bare path when no other params remain", async () => {
    const user = userEvent.setup();
    nav.search = "month=2026-11";
    render(<MonthSwitcher />);
    await user.click(screen.getByRole("button", { name: "Previous month" }));
    expect(nav.push).toHaveBeenLastCalledWith("/");
  });
});

describe("ThemeToggle", () => {
  it("switches between light and dark", async () => {
    const user = userEvent.setup();
    const { rerender } = render(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Toggle dark mode" }));
    expect(theme.setTheme).toHaveBeenLastCalledWith("dark");

    theme.resolvedTheme = "dark";
    rerender(<ThemeToggle />);
    await user.click(screen.getByRole("button", { name: "Toggle dark mode" }));
    expect(theme.setTheme).toHaveBeenLastCalledWith("light");
  });
});
