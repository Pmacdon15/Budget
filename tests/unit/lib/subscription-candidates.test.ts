import { describe, expect, it } from "vitest";
import {
  type CandidateExpense,
  existingBill,
  findSubscriptionCandidates,
  looksLikeSubscription,
  merchantGroup,
} from "@/lib/subscription-candidates";
import type { FixedItem } from "@/lib/types";

let next = 0;
function charge(
  description: string,
  spentOn: string,
  amountCents: number,
  category = "Entertainment",
  extra: { unpaid?: boolean } = {},
): CandidateExpense & { unpaid?: boolean } {
  next++;
  return {
    id: `00000000-0000-4000-8000-${String(next).padStart(12, "0")}`,
    month: spentOn.slice(0, 7),
    spentOn,
    description,
    category,
    amountCents,
    ...extra,
  };
}

const bill = (values: Partial<FixedItem> & { name: string }): FixedItem => ({
  id: "b1",
  category: "Subscriptions",
  amountCents: 1_699,
  dueDay: 5,
  startMonth: "2026-01",
  endMonth: null,
  ...values,
});

describe("looksLikeSubscription", () => {
  it("spots subscription and membership words and well-known services", () => {
    for (const text of [
      "Costco membership",
      "Netflix.com",
      "Spotify P1234",
      "GoodLife Fitness",
      "Google One AI Premium",
      "Patreon* Creator",
      "Annual plan renewal",
    ]) {
      expect(looksLikeSubscription(text), text).toBe(true);
    }
  });

  it("leaves ordinary shopping alone", () => {
    for (const text of ["Shell", "Costco Wholesale", "Superstore", "Uber"]) {
      expect(looksLikeSubscription(text), text).toBe(false);
    }
  });
});

describe("merchantGroup", () => {
  it("keys on the first two words, ignoring numbers and noise", () => {
    expect(merchantGroup("NETFLIX.COM 866-579")).toBe("netflix");
    expect(merchantGroup("Apple Music")).toBe("apple music");
    expect(merchantGroup("1234")).toBeNull();
  });
});

describe("findSubscriptionCandidates", () => {
  it("finds a charge named like a subscription, even once", () => {
    const [c, ...rest] = findSubscriptionCandidates(
      [
        charge("Netflix.com", "2026-10-05", 1_699),
        charge("Shell", "2026-10-06", 5_000),
      ],
      [],
    );
    expect(rest).toEqual([]);
    expect(c).toMatchObject({
      name: "Netflix.com",
      amountCents: 1_699,
      dueDay: 5,
      reasons: ["keyword"],
      match: null,
    });
    expect(c?.expenses).toHaveLength(1);
  });

  it("finds one filed under Subscriptions", () => {
    const [c] = findSubscriptionCandidates(
      [charge("Some App Co", "2026-10-12", 999, "Subscriptions")],
      [],
    );
    expect(c?.reasons).toEqual(["category"]);
    expect(c?.category).toBe("Subscriptions");
  });

  it("finds the same merchant charging a similar amount every month, oldest first", () => {
    const [c] = findSubscriptionCandidates(
      [
        charge("Rogers Wireless", "2026-10-03", 8_500, "Utilities"),
        charge("Rogers Wireless", "2026-09-03", 8_500, "Utilities"),
        charge("Rogers Wireless", "2026-08-04", 8_000, "Utilities"),
      ],
      [],
    );
    expect(c?.reasons).toEqual(["recurring"]);
    expect(c?.expenses.map((e) => e.month)).toEqual([
      "2026-08",
      "2026-09",
      "2026-10",
    ]);
    // The newest charge sets the bill: its name, amount, day and category.
    expect(c).toMatchObject({
      amountCents: 8_500,
      dueDay: 3,
      category: "Utilities",
    });
  });

  it("doesn't take frequent shopping at one store for a subscription", () => {
    const coffee = ["01", "08", "15", "22"].flatMap((day) => [
      charge("Tim Hortons", `2026-09-${day}`, 450, "Dining"),
      charge("Tim Hortons", `2026-10-${day}`, 450, "Dining"),
    ]);
    expect(findSubscriptionCandidates(coffee, [])).toEqual([]);
  });

  it("doesn't group charges whose amounts are far apart", () => {
    expect(
      findSubscriptionCandidates(
        [
          charge("Best Buy", "2026-09-10", 2_000, "Shopping"),
          charge("Best Buy", "2026-10-10", 90_000, "Shopping"),
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("keeps two plans from one company apart", () => {
    const found = findSubscriptionCandidates(
      [
        charge("Apple Music", "2026-10-02", 1_199),
        charge("Apple Music", "2026-10-09", 399),
        charge("Apple Music", "2026-09-02", 1_199),
        charge("Apple Music", "2026-09-09", 399),
      ],
      [],
    );
    expect(found.map((c) => c.amountCents).sort()).toEqual([1_199, 399]);
    for (const c of found) expect(c.expenses).toHaveLength(2);
  });

  it("never suggests usage charges like API credits or top-ups", () => {
    expect(
      findSubscriptionCandidates(
        [
          charge("Anthropic API credits", "2026-10-01", 2_000, "Subscriptions"),
          charge("Anthropic API credits", "2026-09-01", 2_000, "Subscriptions"),
          charge("Claude Pro extra usage", "2026-10-04", 1_000),
          charge("Phone top-up", "2026-10-04", 2_500, "Utilities"),
          charge("Phone top-up", "2026-09-04", 2_500, "Utilities"),
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("skips charges that aren't paid yet", () => {
    expect(
      findSubscriptionCandidates(
        [
          charge("Netflix", "2026-10-05", 1_699, "Entertainment", {
            unpaid: true,
          }),
        ],
        [],
      ),
    ).toEqual([]);
  });

  it("points out a fixed bill the subscription already is", () => {
    const [c] = findSubscriptionCandidates(
      [charge("Netflix.com", "2026-10-05", 1_899)],
      [bill({ name: "Netflix", amountCents: 1_699 })],
    );
    expect(c?.match).toMatchObject({
      bill: { id: "b1", name: "Netflix" },
      kind: "amount_differs",
    });
  });

  it("lists the most recent first", () => {
    const found = findSubscriptionCandidates(
      [
        charge("Spotify", "2026-09-20", 1_199),
        charge("Netflix", "2026-10-05", 1_699),
      ],
      [],
    );
    expect(found.map((c) => c.name)).toEqual(["Netflix", "Spotify"]);
  });
});

describe("existingBill", () => {
  const netflix = charge("Netflix.com", "2026-10-05", 1_699);

  it("matches a bill active in the charge's month", () => {
    expect(existingBill([bill({ name: "Netflix" })], netflix)?.kind).toBe(
      "same_amount",
    );
  });

  it("ignores a bill that ended or hasn't started", () => {
    expect(
      existingBill([bill({ name: "Netflix", endMonth: "2026-09" })], netflix),
    ).toBeNull();
    expect(
      existingBill([bill({ name: "Netflix", startMonth: "2026-11" })], netflix),
    ).toBeNull();
  });

  it("ignores bills with other names", () => {
    expect(existingBill([bill({ name: "Rent" })], netflix)).toBeNull();
  });
});
