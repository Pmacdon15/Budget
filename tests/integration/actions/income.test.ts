import { describe, expect, it } from "vitest";
import { createIncome, deleteIncome, updateIncome } from "@/actions/income";
import { signInAs, signOut } from "../../helpers/auth";
import { rows } from "../../helpers/test-db";

const form = {
  label: "Paycheque",
  amount: "2,500.00",
  month: "2026-10",
  receivedOn: "2026-10-15",
};
const MISSING_ID = "6f1c1c8e-3b1a-4c55-9a51-2f3c0f6a9d10";

const incomeRows = () =>
  rows(
    "select id, user_id, month, label, amount_cents, received_on from income order by created_at",
  );

describe("take-home actions", () => {
  it("records a paycheque", async () => {
    expect(await createIncome(form)).toEqual({ ok: true });
    const [row] = await incomeRows();
    expect(row).toMatchObject({
      user_id: "user_a",
      month: "2026-10",
      label: "Paycheque",
      amount_cents: 250_000,
    });
    expect(row?.received_on).toBeInstanceOf(Date);
  });

  it("allows a blank received date", async () => {
    await createIncome({ ...form, receivedOn: "" });
    expect((await incomeRows())[0]?.received_on).toBeNull();
  });

  it("updates and deletes an entry", async () => {
    await createIncome(form);
    const id = (await incomeRows())[0]?.id as string;
    expect(await updateIncome(id, { ...form, amount: "2600" })).toEqual({
      ok: true,
    });
    expect((await incomeRows())[0]?.amount_cents).toBe(260_000);
    expect(await deleteIncome(id)).toEqual({ ok: true });
    expect(await incomeRows()).toEqual([]);
  });

  it("validates the month and amount", async () => {
    const result = await createIncome({
      ...form,
      month: "2026-13",
      amount: "",
    });
    expect(result).toMatchObject({
      ok: false,
      fieldErrors: {
        month: ["Invalid month"],
        amount: ["Enter a valid amount, like 1250.00"],
      },
    });
    expect(await incomeRows()).toEqual([]);
  });

  it("reports missing entries and protects other users' entries", async () => {
    expect(await deleteIncome(MISSING_ID)).toEqual({
      ok: false,
      error: "That item no longer exists.",
    });

    await createIncome(form);
    const id = (await incomeRows())[0]?.id as string;
    signInAs("user_b");
    expect(await updateIncome(id, form)).toMatchObject({ ok: false });
    expect(await deleteIncome(id)).toMatchObject({ ok: false });
    expect(await incomeRows()).toHaveLength(1);
  });

  it("refuses to write when signed out", async () => {
    signOut();
    expect(await createIncome(form)).toMatchObject({ ok: false });
    expect(await incomeRows()).toEqual([]);
  });
});
