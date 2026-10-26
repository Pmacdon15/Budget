/*
 * Leftover spend: what's actually left to spend this month. It starts from
 * the budget (take-home minus fixed bills and spending) and is held to the
 * money in the user's chequing accounts. Credit cards and lines of credit
 * never count, since a balance there may be carried on purpose. Pure, so the
 * overview, the report, the CSV export, "safe to spend" and the MCP tools
 * all get the same number from one place.
 */

export type LeftoverLimit =
  /** No chequing accounts: the budget is all there is to go on. */
  | "budget"
  /** Chequing holds less than the budget has left. */
  | "chequing"
  /** Chequing is below zero overall: nothing is left to spend. */
  | "overdrawn";

export type Leftover = {
  /** Take-home minus fixed bills and spending; negative when over budget. */
  budgetLeftCents: number;
  /** All chequing accounts combined, or null when there are none. */
  netChequingCents: number | null;
  /** What's left to spend. Never above zero while chequing is negative. */
  leftoverCents: number;
  limitedBy: LeftoverLimit;
};

export function leftoverSpend(
  budgetLeftCents: number,
  netChequingCents: number | null,
): Leftover {
  if (netChequingCents === null) {
    return {
      budgetLeftCents,
      netChequingCents,
      leftoverCents: budgetLeftCents,
      limitedBy: "budget",
    };
  }
  if (netChequingCents < 0) {
    return {
      budgetLeftCents,
      netChequingCents,
      leftoverCents: 0,
      limitedBy: "overdrawn",
    };
  }
  if (netChequingCents < budgetLeftCents) {
    return {
      budgetLeftCents,
      netChequingCents,
      leftoverCents: netChequingCents,
      limitedBy: "chequing",
    };
  }
  return {
    budgetLeftCents,
    netChequingCents,
    leftoverCents: budgetLeftCents,
    limitedBy: "budget",
  };
}

/**
 * Whether the chequing rule applies to `month`: this month and later. A month
 * that's over keeps what was really left over then, since today's balance
 * says nothing about it.
 */
export const leftoverAppliesTo = (month: string, current: string) =>
  month >= current;
