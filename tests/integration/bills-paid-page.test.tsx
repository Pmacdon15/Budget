import { describe, expect, it } from "vitest";
import FixedPage from "@/app/(app)/fixed/page";
import { getFixedItems } from "@/dal/fixed-items";
import { insertBillPayment } from "@/db/bill-payments";
import { insertFixedItem } from "@/db/fixed-items";
import { signInAs } from "../helpers/auth";
import { renderPage, searchParams, textOf } from "../helpers/render-page";

const MONTH = "2026-10";

async function seedBills(userId = "user_a") {
  for (const [name, amountCents] of [
    ["Rent", 150_000],
    ["Phone", 6_500],
  ] as const) {
    await insertFixedItem(userId, {
      name,
      category: "Housing",
      amountCents,
      dueDay: 1,
      startMonth: "2026-01",
    });
  }
}

const render = async (month = MONTH) =>
  textOf(await renderPage(FixedPage({ searchParams: searchParams(month) })));

describe("Fixed bills page: paid", () => {
  it("shows every bill as still due until one is marked paid", async () => {
    await seedBills();
    const text = await render();
    expect(text).toContain("0 of 2 paid · $1,565.00 still due");
    expect(text).toContain("Mark paid");
  });

  it("shows what's paid this month, and the total is unchanged", async () => {
    await seedBills();
    const rent = (await getFixedItems()).find((i) => i.name === "Rent");
    if (!rent) throw new Error("no rent");
    await insertBillPayment("user_a", rent.id, MONTH);

    const text = await render();
    expect(text).toContain("1 of 2 paid · $65.00 still due");
    expect(text).toContain("$1,565.00 / month");

    expect(await render("2026-11")).toContain("0 of 2 paid");
  });

  it("ignores another user's paid marks", async () => {
    await seedBills("user_b");
    signInAs("user_b");
    const [bill] = await getFixedItems();
    if (!bill) throw new Error("no bill");
    await insertBillPayment("user_b", bill.id, MONTH);

    signInAs("user_a");
    await seedBills("user_a");
    expect(await render()).toContain("0 of 2 paid");
  });
});
