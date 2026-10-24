import { describe, expect, it } from "vitest";
import {
  deleteIncomeRow,
  insertIncome,
  selectIncomeBetween,
  selectLatestIncome,
  updateIncomeRow,
} from "@/db/income";

const values = {
  month: "2026-10",
  label: "Paycheque",
  amountCents: 250_000,
  receivedOn: "2026-10-15",
};

describe("db/income", () => {
  it("inserts and reads back entries, with or without a received date", async () => {
    await insertIncome("user_a", values);
    await insertIncome("user_a", {
      ...values,
      label: "Side job",
      receivedOn: null,
    });
    const found = await selectIncomeBetween("user_a", "2026-10", "2026-10");
    expect(found).toEqual([
      { id: expect.any(String), ...values },
      {
        id: expect.any(String),
        ...values,
        label: "Side job",
        receivedOn: null,
      },
    ]);
  });

  it("orders by month, then received date (blanks last)", async () => {
    await insertIncome("user_a", {
      ...values,
      month: "2026-09",
      label: "sep",
      receivedOn: null,
    });
    await insertIncome("user_a", {
      ...values,
      label: "early",
      receivedOn: "2026-10-01",
    });
    await insertIncome("user_a", {
      ...values,
      label: "undated",
      receivedOn: null,
    });
    await insertIncome("user_a", {
      ...values,
      label: "late",
      receivedOn: "2026-10-30",
    });

    const found = await selectIncomeBetween("user_a", "2026-09", "2026-10");
    expect(found.map((i) => i.label)).toEqual([
      "late",
      "early",
      "undated",
      "sep",
    ]);
  });

  it("finds the latest entry for prefilling", async () => {
    expect(await selectLatestIncome("user_a")).toBeNull();
    await insertIncome("user_a", { ...values, month: "2026-08", label: "old" });
    await insertIncome("user_a", {
      ...values,
      month: "2026-09",
      label: "newest month",
    });
    await insertIncome("user_b", {
      ...values,
      month: "2027-01",
      label: "someone else",
    });
    expect(await selectLatestIncome("user_a")).toMatchObject({
      label: "newest month",
    });
  });

  it("updates and deletes only the owner's rows", async () => {
    await insertIncome("user_a", values);
    const [row] = await selectIncomeBetween("user_a", "2026-10", "2026-10");
    const id = row?.id as string;

    expect(
      await updateIncomeRow("user_b", id, { ...values, amountCents: 1 }),
    ).toBe(false);
    expect(
      await updateIncomeRow("user_a", id, { ...values, amountCents: 1 }),
    ).toBe(true);
    expect((await selectLatestIncome("user_a"))?.amountCents).toBe(1);

    expect(await deleteIncomeRow("user_b", id)).toBe(false);
    expect(await deleteIncomeRow("user_a", id)).toBe(true);
    expect(await selectLatestIncome("user_a")).toBeNull();
  });
});
