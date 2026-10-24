import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import WelcomePage, { metadata } from "@/app/welcome/page";
import { formatMoney } from "@/lib/money";
import { SAMPLE_TOTALS } from "@/lib/sample-month";

describe("public homepage", () => {
  it("has its own page title", () => {
    expect(metadata.title).toEqual({
      absolute: expect.stringContaining("Budget"),
    });
  });

  it("leads with a single headline", () => {
    render(<WelcomePage />);
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("sends visitors to the Clerk sign-up and sign-in pages", () => {
    render(<WelcomePage />);
    const hrefs = screen
      .getAllByRole("link")
      .map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/sign-up");
    expect(hrefs).toContain("/sign-in");
  });

  it("labels the example month as a sample and shows what was left", () => {
    render(<WelcomePage />);
    expect(screen.getAllByText(/sample/i).length).toBeGreaterThan(0);
    expect(
      screen.getAllByText(formatMoney(SAMPLE_TOTALS.leftCents)).length,
    ).toBeGreaterThan(0);
  });
});
