import { describe, expect, it } from "vitest";
import {
  deleteFixedItemRow,
  insertFixedItem,
  selectFixedItem,
  selectFixedItems,
  setFixedItemEndMonth,
  splitFixedItem,
  updateFixedItemValues,
} from "@/db/fixed-items";

const values = {
  name: "Rent",
  category: "Housing",
  amountCents: 150_000,
  dueDay: 1,
};

async function onlyItem(userId = "user_a") {
  const [item] = await selectFixedItems(userId);
  if (!item) throw new Error("no fixed item");
  return item;
}

describe("db/fixed-items", () => {
  it("inserts and reads back a bill", async () => {
    await insertFixedItem("user_a", { ...values, startMonth: "2026-10" });
    expect(await onlyItem()).toEqual({
      id: expect.any(String),
      ...values,
      startMonth: "2026-10",
      endMonth: null,
    });
  });

  it("stores bills without a due day or with an end month", async () => {
    await insertFixedItem("user_a", {
      ...values,
      dueDay: null,
      startMonth: "2026-01",
      endMonth: "2026-06",
    });
    expect(await onlyItem()).toMatchObject({
      dueDay: null,
      endMonth: "2026-06",
    });
  });

  it("lists newest start month first, then by name", async () => {
    await insertFixedItem("user_a", {
      ...values,
      name: "B old",
      startMonth: "2026-01",
    });
    await insertFixedItem("user_a", {
      ...values,
      name: "Z new",
      startMonth: "2026-05",
    });
    await insertFixedItem("user_a", {
      ...values,
      name: "A new",
      startMonth: "2026-05",
    });
    const names = (await selectFixedItems("user_a")).map((i) => i.name);
    expect(names).toEqual(["A new", "Z new", "B old"]);
  });

  it("keeps each user's bills private", async () => {
    await insertFixedItem("user_b", { ...values, startMonth: "2026-10" });
    const theirs = await onlyItem("user_b");
    expect(await selectFixedItems("user_a")).toEqual([]);
    expect(await selectFixedItem("user_a", theirs.id)).toBeNull();

    await updateFixedItemValues("user_a", theirs.id, {
      ...values,
      amountCents: 1,
    });
    await setFixedItemEndMonth("user_a", theirs.id, "2026-10");
    await deleteFixedItemRow("user_a", theirs.id);
    expect(await selectFixedItem("user_b", theirs.id)).toEqual(theirs);
  });

  it("updates values in place", async () => {
    await insertFixedItem("user_a", { ...values, startMonth: "2026-10" });
    const item = await onlyItem();
    await updateFixedItemValues("user_a", item.id, {
      name: "Rent (new place)",
      category: "Housing",
      amountCents: 175_000,
      dueDay: null,
    });
    expect(await selectFixedItem("user_a", item.id)).toMatchObject({
      name: "Rent (new place)",
      amountCents: 175_000,
      dueDay: null,
      startMonth: "2026-10",
    });
  });

  it("splits a bill into an ended original and a replacement", async () => {
    await insertFixedItem("user_a", { ...values, startMonth: "2026-01" });
    const original = await onlyItem();
    await splitFixedItem("user_a", original.id, "2026-09", {
      ...values,
      amountCents: 160_000,
      startMonth: "2026-10",
      endMonth: null,
    });

    const items = await selectFixedItems("user_a");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      amountCents: 160_000,
      startMonth: "2026-10",
      endMonth: null,
    });
    expect(items[1]).toMatchObject({
      id: original.id,
      amountCents: 150_000,
      startMonth: "2026-01",
      endMonth: "2026-09",
    });
  });

  it("rolls back a split if the replacement can't be inserted", async () => {
    await insertFixedItem("user_a", { ...values, startMonth: "2026-01" });
    const original = await onlyItem();
    await expect(
      splitFixedItem("user_a", original.id, "2026-09", {
        ...values,
        amountCents: -5,
        startMonth: "2026-10",
        endMonth: null,
      }),
    ).rejects.toThrow();
    expect(await selectFixedItems("user_a")).toEqual([original]);
  });

  it("ends and deletes bills", async () => {
    await insertFixedItem("user_a", { ...values, startMonth: "2026-01" });
    const item = await onlyItem();
    await setFixedItemEndMonth("user_a", item.id, "2026-04");
    expect((await onlyItem()).endMonth).toBe("2026-04");
    await deleteFixedItemRow("user_a", item.id);
    expect(await selectFixedItems("user_a")).toEqual([]);
  });
});
