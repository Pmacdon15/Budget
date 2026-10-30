import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as expenseActions from "@/actions/expenses";
import {
  ExpenseDialog,
  type ScannedReceipt,
} from "@/components/forms/expense-dialog";
import { fetchMerchantMemory } from "@/queries/merchant-memory";
import { expense } from "../../helpers/fixtures";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));

const PHOTO = "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg";

function rememberMerchants(merchants: Record<string, string>) {
  const fetch = vi.fn(async () => Response.json({ merchants }));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
  vi.mocked(expenseActions.createExpense).mockResolvedValue({ ok: true });
  vi.mocked(expenseActions.updateExpense).mockResolvedValue({ ok: true });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const trigger = <button type="button">Open</button>;

async function openForm() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

async function save(
  user: ReturnType<typeof userEvent.setup>,
  dialog: HTMLElement,
  name = "Add expense",
) {
  await user.click(within(dialog).getByRole("button", { name }));
}

describe("merchant memory in the expense form", () => {
  it("picks the category used last time once the merchant is typed", async () => {
    const fetch = rememberMerchants({ "costco wholesale": "Personal" });
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await openForm();
    expect(fetch).toHaveBeenCalledWith(
      "/api/merchant-categories",
      expect.objectContaining({ cache: "no-store" }),
    );

    await user.type(
      within(dialog).getByLabelText("Description"),
      "Costco Wholesale #12",
    );
    expect(
      await within(dialog).findByText(
        "Same as last time at Costco Wholesale #12.",
      ),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Amount"), "20.00");
    await save(user, dialog);

    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Costco Wholesale #12",
          category: "Personal",
        }),
      ),
    );
  });

  it("keeps a category the user picked and offers the remembered one", async () => {
    rememberMerchants({ esso: "Transportation" });
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await openForm();

    await user.click(within(dialog).getByLabelText("Category"));
    await user.click(await screen.findByRole("option", { name: /Dining/ }));
    await user.type(within(dialog).getByLabelText("Description"), "Esso");

    expect(
      await within(dialog).findByText(/Last time at Esso: Fuel & Travel\./),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Amount"), "60.00");
    await save(user, dialog);
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category: "Dining" }),
      ),
    );
  });

  it("switches to the remembered category with one tap", async () => {
    rememberMerchants({ esso: "Transportation" });
    renderWithQuery(<ExpenseDialog month="2026-10" trigger={trigger} />);
    const { user, dialog } = await openForm();

    await user.click(within(dialog).getByLabelText("Category"));
    await user.click(await screen.findByRole("option", { name: /Dining/ }));
    await user.type(within(dialog).getByLabelText("Description"), "Esso");
    await user.click(
      await within(dialog).findByRole("button", { name: "Use Fuel & Travel" }),
    );
    expect(
      within(dialog).getByText("Same as last time at Esso."),
    ).toBeInTheDocument();
    await user.type(within(dialog).getByLabelText("Amount"), "60.00");
    await save(user, dialog);
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category: "Transportation" }),
      ),
    );
  });

  it("prefers the last choice over the receipt reader's guess, and offers the guess", async () => {
    rememberMerchants({ costco: "Personal" });
    const scan: ScannedReceipt = {
      image: PHOTO,
      recognised: true,
      previewUrl: "blob:preview",
      fields: {
        merchant: "COSTCO",
        purchasedOn: "2026-10-05",
        totalCents: 5_000,
        category: "Groceries",
      },
    };
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        scan={scan}
        open
        onOpenChange={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(
      await within(dialog).findByText("Same as last time at COSTCO."),
    ).toBeInTheDocument();

    await user.click(
      within(dialog).getByRole("button", {
        name: /Use the receipt's guess/,
      }),
    );
    await save(user, dialog);
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category: "Groceries" }),
      ),
    );
  });

  it("uses the reader's guess when the merchant is new", async () => {
    rememberMerchants({ esso: "Transportation" });
    const scan: ScannedReceipt = {
      image: PHOTO,
      recognised: true,
      previewUrl: "blob:preview",
      fields: {
        merchant: "Shell",
        purchasedOn: "2026-10-05",
        totalCents: 5_000,
        category: "Auto",
      },
    };
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        scan={scan}
        open
        onOpenChange={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    expect(within(dialog).queryByText(/last time/i)).toBeNull();
    await save(user, dialog);
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({ category: "Auto" }),
      ),
    );
  });

  it("leaves an edit alone and doesn't load the memory for it", async () => {
    const fetch = rememberMerchants({ "costco run": "Personal" });
    const item = expense({ category: "Dining" });
    renderWithQuery(
      <ExpenseDialog month="2026-10" expense={item} trigger={trigger} />,
    );
    const { user, dialog } = await openForm();
    expect(within(dialog).queryByText(/last time/i)).toBeNull();
    await save(user, dialog, "Save changes");
    await waitFor(() =>
      expect(expenseActions.updateExpense).toHaveBeenCalledWith(
        item.id,
        expect.objectContaining({ category: "Dining" }),
      ),
    );
    // Only the accounts for "Paid from" load; the memory is left alone.
    expect(fetch).not.toHaveBeenCalledWith(
      "/api/merchant-categories",
      expect.anything(),
    );
  });
});

describe("fetchMerchantMemory", () => {
  it("returns the remembered merchants", async () => {
    rememberMerchants({ costco: "Groceries" });
    expect(await fetchMerchantMemory()).toEqual({ costco: "Groceries" });
  });

  it("treats any failure as an empty memory", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "no" }, { status: 401 })),
    );
    expect(await fetchMerchantMemory()).toEqual({});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ image: "not a memory" })),
    );
    expect(await fetchMerchantMemory()).toEqual({});

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("offline");
      }),
    );
    expect(await fetchMerchantMemory()).toEqual({});
  });
});
