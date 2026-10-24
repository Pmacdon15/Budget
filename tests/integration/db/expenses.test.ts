import { describe, expect, it } from "vitest";
import {
  deleteExpenseRow,
  insertExpense,
  selectExpensesBetween,
  updateExpenseRow,
} from "@/db/expenses";

const values = {
  month: "2026-10",
  spentOn: "2026-10-05",
  description: "Costco run",
  category: "Groceries",
  amountCents: 12_345,
};

describe("db/expenses", () => {
  it("inserts and reads back expenses as app objects", async () => {
    await insertExpense("user_a", values);
    const [row] = await selectExpensesBetween("user_a", "2026-10", "2026-10");
    expect(row).toEqual({ id: expect.any(String), ...values });
  });

  it("filters by month range, newest first", async () => {
    await insertExpense("user_a", {
      ...values,
      month: "2026-08",
      spentOn: "2026-08-01",
    });
    await insertExpense("user_a", {
      ...values,
      spentOn: "2026-10-01",
      description: "early",
    });
    await insertExpense("user_a", {
      ...values,
      spentOn: "2026-10-20",
      description: "late",
    });
    await insertExpense("user_a", {
      ...values,
      month: "2026-11",
      spentOn: "2026-11-01",
    });

    const found = await selectExpensesBetween("user_a", "2026-09", "2026-10");
    expect(found.map((e) => e.description)).toEqual(["late", "early"]);
  });

  it("never returns another user's expenses", async () => {
    await insertExpense("user_b", values);
    expect(await selectExpensesBetween("user_a", "2026-01", "2026-12")).toEqual(
      [],
    );
  });

  it("updates only the owner's row", async () => {
    await insertExpense("user_a", values);
    const [row] = await selectExpensesBetween("user_a", "2026-10", "2026-10");
    const id = row?.id as string;
    const changed = { ...values, description: "Gas", amountCents: 6_000 };

    expect(await updateExpenseRow("user_b", id, changed)).toBe(false);
    expect(await updateExpenseRow("user_a", id, changed)).toBe(true);

    const [after] = await selectExpensesBetween("user_a", "2026-10", "2026-10");
    expect(after).toMatchObject({ description: "Gas", amountCents: 6_000 });
  });

  it("deletes only the owner's row", async () => {
    await insertExpense("user_a", values);
    const [row] = await selectExpensesBetween("user_a", "2026-10", "2026-10");
    const id = row?.id as string;

    expect(await deleteExpenseRow("user_b", id)).toBe(false);
    expect(await deleteExpenseRow("user_a", id)).toBe(true);
    expect(await deleteExpenseRow("user_a", id)).toBe(false);
  });
});
