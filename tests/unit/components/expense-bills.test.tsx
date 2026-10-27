import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/actions/expense-bills";
import { ExpenseActions } from "@/components/expense-actions";
import {
  convertedMessage,
  FindSubscriptionsDialog,
} from "@/components/expense-bills/find-subscriptions-dialog";
import { MakeFixedBillDialog } from "@/components/expense-bills/make-fixed-bill-dialog";
import type { BillMatch } from "@/lib/bill-matching";
import type { SubscriptionCandidate } from "@/lib/subscription-candidates";
import { expense } from "../../helpers/fixtures";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/expense-bills", () => ({
  makeExpenseFixedBill: vi.fn(),
  convertSubscriptions: vi.fn(),
}));
vi.mock("@/actions/undo", () => ({
  deleteExpenseWithUndo: vi.fn(),
  undoDelete: vi.fn(),
}));

const BILL_ID = "1b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b";

const netflix = expense({
  description: "Netflix",
  category: "Entertainment",
  amountCents: 1_699,
  spentOn: "2026-10-07",
});

const match = (overrides: Partial<BillMatch> = {}): BillMatch => ({
  bill: {
    id: BILL_ID,
    name: "Netflix Standard",
    amountCents: 1_599,
    dueDay: 5,
    isEstimate: false,
  },
  kind: "amount_differs",
  score: 0.9,
  nameScore: 1,
  differenceCents: 100,
  looksLikeUsage: false,
  suggestion: "",
  ...overrides,
});

beforeEach(() => {
  vi.mocked(actions.makeExpenseFixedBill).mockResolvedValue({ ok: true });
  vi.mocked(actions.convertSubscriptions).mockResolvedValue({
    ok: true,
    converted: { created: 1, payments: 2, skipped: 0 },
  });
});

const trigger = <button type="button">Open</button>;

async function open() {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("ExpenseActions", () => {
  it("offers Make fixed bill in the row menu", async () => {
    renderWithQuery(<ExpenseActions expense={netflix} />);
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: "Actions for Netflix" }),
    );
    const menu = await screen.findByRole("menu");
    await user.click(
      within(menu).getByRole("menuitem", { name: /Make fixed bill/ }),
    );
    expect(
      await screen.findByRole("dialog", { name: "Make it a fixed bill" }),
    ).toBeVisible();
  });

  it("doesn't offer it for an unpaid expense or a bill's payment", async () => {
    const user = userEvent.setup();
    for (const item of [
      { ...netflix, unpaid: true },
      { ...netflix, fixedItemId: BILL_ID },
    ]) {
      const { unmount } = renderWithQuery(<ExpenseActions expense={item} />);
      await user.click(
        screen.getByRole("button", { name: "Actions for Netflix" }),
      );
      const menu = await screen.findByRole("menu");
      expect(
        within(menu).queryByRole("menuitem", { name: /Make fixed bill/ }),
      ).toBeNull();
      unmount();
    }
  });
});

describe("MakeFixedBillDialog", () => {
  it("pre-fills a new bill from the expense and saves it once confirmed", async () => {
    renderWithQuery(
      <MakeFixedBillDialog expense={netflix} match={null} trigger={trigger} />,
    );
    const { user, dialog } = await open();
    expect(within(dialog).getByLabelText("Name")).toHaveValue("Netflix");
    expect(within(dialog).getByLabelText(/Due day/)).toHaveValue(7);
    expect(
      within(dialog).getByText("$16.99 a month, from October 2026."),
    ).toBeVisible();
    expect(actions.makeExpenseFixedBill).not.toHaveBeenCalled();

    await user.clear(within(dialog).getByLabelText("Name"));
    await user.type(within(dialog).getByLabelText("Name"), "Netflix Standard");
    await user.click(
      within(dialog).getByRole("button", { name: "Make fixed bill" }),
    );
    await waitFor(() =>
      expect(actions.makeExpenseFixedBill).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "new",
          expenseId: netflix.id,
          name: "Netflix Standard",
          category: "Entertainment",
          dueDay: "7",
          matchKeywords: "Netflix",
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Fixed bill added");
  });

  it("offers the bill it matches first, updating its amount", async () => {
    renderWithQuery(
      <MakeFixedBillDialog
        expense={netflix}
        match={match()}
        trigger={trigger}
      />,
    );
    const { user, dialog } = await open();
    expect(
      within(dialog).getByRole("radio", {
        name: /Mark Netflix Standard paid for October 2026/,
      }),
    ).toBeChecked();
    expect(within(dialog).queryByLabelText("Name")).toBeNull();
    expect(
      within(dialog).getByRole("checkbox", {
        name: /Update Netflix Standard from \$15.99 to \$16.99/,
      }),
    ).toBeChecked();

    await user.click(
      within(dialog).getByRole("button", { name: "Mark bill paid" }),
    );
    await waitFor(() =>
      expect(actions.makeExpenseFixedBill).toHaveBeenCalledWith(
        expect.objectContaining({
          mode: "existing",
          expenseId: netflix.id,
          fixedItemId: BILL_ID,
          updateAmount: "on",
        }),
      ),
    );
    expect(toast.success).toHaveBeenCalledWith("Bill marked paid");
  });

  it("can add a new bill instead of the match", async () => {
    renderWithQuery(
      <MakeFixedBillDialog
        expense={netflix}
        match={match({ kind: "amount_far" })}
        trigger={trigger}
      />,
    );
    const { user, dialog } = await open();
    // A far-off amount defaults to a new bill.
    expect(
      within(dialog).getByRole("radio", { name: /add a new one/ }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole("radio", { name: /Mark Netflix Standard paid/ }),
    );
    await user.click(
      within(dialog).getByRole("radio", { name: /add a new one/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Make fixed bill" }),
    );
    await waitFor(() =>
      expect(actions.makeExpenseFixedBill).toHaveBeenCalledWith(
        expect.objectContaining({ mode: "new", name: "Netflix" }),
      ),
    );
  });

  it("shows why the server refused", async () => {
    vi.mocked(actions.makeExpenseFixedBill).mockResolvedValue({
      ok: false,
      error: "Netflix Standard is already paid for 2026-10 by another expense.",
    });
    renderWithQuery(
      <MakeFixedBillDialog
        expense={netflix}
        match={match()}
        trigger={trigger}
      />,
    );
    const { user, dialog } = await open();
    await user.click(
      within(dialog).getByRole("button", { name: "Mark bill paid" }),
    );
    expect(
      await within(dialog).findByText(
        "Netflix Standard is already paid for 2026-10 by another expense.",
      ),
    ).toBeVisible();
  });
});

describe("FindSubscriptionsDialog", () => {
  const candidate = (
    overrides: Partial<SubscriptionCandidate> = {},
  ): SubscriptionCandidate => ({
    key: "c1",
    name: "Spotify",
    category: "Entertainment",
    amountCents: 1_199,
    dueDay: 12,
    reasons: ["keyword", "recurring"],
    expenses: [
      {
        id: "2b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b",
        month: "2026-09",
        spentOn: "2026-09-12",
        description: "Spotify",
        category: "Entertainment",
        amountCents: 1_199,
      },
      {
        id: "3b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b",
        month: "2026-10",
        spentOn: "2026-10-12",
        description: "Spotify",
        category: "Entertainment",
        amountCents: 1_199,
      },
    ],
    match: null,
    ...overrides,
  });

  function serve(candidates: SubscriptionCandidate[], status = 200) {
    const fetch = vi.fn(async () =>
      Response.json(
        status === 200 ? { month: "2026-10", candidates } : { error: "Nope" },
        { status },
      ),
    );
    vi.stubGlobal("fetch", fetch);
    return fetch;
  }

  async function openFinder() {
    const user = userEvent.setup();
    await user.click(
      screen.getByRole("button", { name: /Find subscriptions/ }),
    );
    return { user, dialog: await screen.findByRole("dialog") };
  }

  it("loads candidates when opened and converts only the ticked ones", async () => {
    const fetch = serve([
      candidate(),
      candidate({
        key: "c2",
        name: "Costco membership",
        amountCents: 6_500,
        reasons: ["keyword"],
        expenses: [
          {
            id: "4b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b",
            month: "2026-08",
            spentOn: "2026-08-02",
            description: "Costco membership",
            category: "Personal",
            amountCents: 6_500,
          },
        ],
      }),
    ]);
    renderWithQuery(<FindSubscriptionsDialog month="2026-10" />);
    expect(fetch).not.toHaveBeenCalled();
    const { user, dialog } = await openFinder();
    expect(fetch).toHaveBeenCalledWith(
      "/api/subscription-candidates?month=2026-10",
      expect.anything(),
    );
    expect(await within(dialog).findByText("Spotify")).toBeVisible();
    expect(
      within(dialog).getByText("2 charges · September 2026, October 2026"),
    ).toBeVisible();
    expect(within(dialog).getByText("Charged every month")).toBeVisible();

    // Nothing is picked until the user ticks it.
    const convert = within(dialog).getByRole("button", {
      name: "Make fixed bills",
    });
    expect(convert).toBeDisabled();

    await user.click(
      within(dialog).getByRole("checkbox", {
        name: "Make Spotify a fixed bill",
      }),
    );
    await user.clear(within(dialog).getByLabelText("Name for Spotify"));
    await user.type(
      within(dialog).getByLabelText("Name for Spotify"),
      "Spotify Premium",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Make 1 fixed bill" }),
    );
    await waitFor(() =>
      expect(actions.convertSubscriptions).toHaveBeenCalledWith({
        items: [
          {
            expenseIds: [
              "2b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b",
              "3b6f4a8e-5d2c-4f1a-9e3b-7c8d9e0f1a2b",
            ],
            name: "Spotify Premium",
            category: "Entertainment",
          },
        ],
      }),
    );
    expect(toast.success).toHaveBeenCalledWith(
      "Made 1 fixed bill from 2 charges.",
    );
  });

  it("pays a bill the user already has when it matches", async () => {
    serve([
      candidate({
        match: match({ bill: { ...match().bill, name: "Spotify Family" } }),
      }),
    ]);
    renderWithQuery(<FindSubscriptionsDialog month="2026-10" />);
    const { user, dialog } = await openFinder();
    await user.click(
      await within(dialog).findByRole("checkbox", {
        name: "Make Spotify a fixed bill",
      }),
    );
    expect(
      within(dialog).getByRole("radio", {
        name: /Pay your bill “Spotify Family”/,
      }),
    ).toBeChecked();
    await user.click(
      within(dialog).getByRole("checkbox", { name: /Update it to \$11.99/ }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Make 1 fixed bill" }),
    );
    await waitFor(() =>
      expect(actions.convertSubscriptions).toHaveBeenCalledWith({
        items: [
          expect.objectContaining({
            fixedItemId: BILL_ID,
            updateAmount: false,
          }),
        ],
      }),
    );
  });

  it("selects all at once", async () => {
    serve([candidate(), candidate({ key: "c2", name: "Crave" })]);
    renderWithQuery(<FindSubscriptionsDialog month="2026-10" />);
    const { user, dialog } = await openFinder();
    await user.click(
      await within(dialog).findByRole("checkbox", { name: "Select all (2)" }),
    );
    expect(
      within(dialog).getByRole("button", { name: "Make 2 fixed bills" }),
    ).toBeEnabled();
  });

  it("says so when nothing looks like a subscription", async () => {
    serve([]);
    renderWithQuery(<FindSubscriptionsDialog month="2026-10" />);
    const { dialog } = await openFinder();
    expect(
      await within(dialog).findByText(/Nothing here looks like a subscription/),
    ).toBeVisible();
  });

  it("shows a load error", async () => {
    serve([], 401);
    renderWithQuery(<FindSubscriptionsDialog month="2026-10" />);
    const { dialog } = await openFinder();
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("Nope");
  });
});

describe("convertedMessage", () => {
  it("counts bills, charges and anything left alone", () => {
    expect(convertedMessage({ created: 2, payments: 5, skipped: 0 })).toBe(
      "Made 2 fixed bills from 5 charges.",
    );
    expect(convertedMessage({ created: 0, payments: 1, skipped: 1 })).toBe(
      "Updated your bills from 1 charge. 1 left as an expense: the bill was already paid or didn't run that month.",
    );
  });
});
