import { describe, expect, it } from "vitest";
import { setBankBalance } from "@/actions/bank-balance";
import OverviewPage from "@/app/(app)/page";
import { signInAs } from "../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../helpers/render-page";

const render = async (month = "2026-10") =>
  textOf(await renderPage(OverviewPage({ searchParams: searchParams(month) })));

describe("Bank balance on the Overview", () => {
  it("has its label in the static shell but not the number", async () => {
    await setBankBalance({ balance: "1234.56" });
    const text = textOf(
      await renderShell(OverviewPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Bank balance");
    expect(text).not.toContain("$1,234.56");
  });

  it("asks for a balance before one is entered", async () => {
    const text = await render();
    expect(text).toContain("Bank balance");
    expect(text).toContain("Add balance");
    expect(text).toContain("Negative is fine if you're overdrawn.");
  });

  it("shows a positive balance", async () => {
    await setBankBalance({ balance: "1234.56" });
    const text = await render();
    expect(text).toContain("$1,234.56");
    expect(text).toContain("Updated");
    expect(text).not.toContain("Overdrawn");
  });

  it("shows an overdrawn balance as negative and flags it", async () => {
    await setBankBalance({ balance: "-123.45" });
    const text = await render();
    expect(text.replace(/\s/g, " ")).toMatch(/-\$123\.45/);
    expect(text).toContain("Overdrawn");
  });

  it("is the same whichever month is being viewed", async () => {
    await setBankBalance({ balance: "-50" });
    expect(await render("2026-03")).toContain("Overdrawn");
  });

  it("shows only the signed-in user's balance", async () => {
    signInAs("user_b");
    await setBankBalance({ balance: "-999" });
    signInAs("user_a");
    const text = await render();
    expect(text).not.toContain("$999.00");
    expect(text).toContain("Add balance");
  });
});
