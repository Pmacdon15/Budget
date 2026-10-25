import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as rolloverActions from "@/actions/rollover";
import { RolloverDialog } from "@/components/rollover/rollover-dialog";
import type { RolloverSettings } from "@/lib/rollover";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/rollover", () => ({ saveRollover: vi.fn() }));

beforeEach(() => {
  vi.mocked(rolloverActions.saveRollover).mockResolvedValue({ ok: true });
});

const limits = [
  { category: "Groceries", limitCents: 60_000 },
  { category: "Dining", limitCents: 20_000 },
];

async function open(
  settings: RolloverSettings = {
    enabled: false,
    startMonth: "2026-10",
    excluded: [],
  },
) {
  renderWithQuery(
    <RolloverDialog
      month="2026-10"
      settings={settings}
      limits={limits}
      amounts={
        settings.enabled
          ? [
              {
                category: "Groceries",
                carriedCents: 4_000,
                calculatedCents: 10_000,
                adjusted: true,
              },
            ]
          : []
      }
      trigger={<button type="button">Open</button>}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  return { user, dialog: await screen.findByRole("dialog") };
}

describe("RolloverDialog", () => {
  it("starts off, from the month being viewed, with every budgeted category ticked", async () => {
    const { dialog } = await open();
    expect(
      within(dialog).getByLabelText("Roll over unspent budget"),
    ).not.toBeChecked();
    expect(within(dialog).getByLabelText("Starts from")).toHaveValue("2026-10");
    expect(within(dialog).getByLabelText("Groceries")).toBeChecked();
    expect(within(dialog).getByLabelText("Meals & Dining")).toBeChecked();
    expect(dialog).toHaveTextContent("Carried into October 2026");
  });

  it("shows the calculated amount and any hand-set one", async () => {
    const { dialog } = await open({
      enabled: true,
      startMonth: "2026-08",
      excluded: ["Dining"],
    });
    expect(within(dialog).getByLabelText("Meals & Dining")).not.toBeChecked();
    expect(dialog).toHaveTextContent("Calculated: $100.00");
    expect(
      within(dialog).getByLabelText("Groceries carried into October 2026"),
    ).toHaveValue("40.00");
  });

  it("saves the settings and amounts", async () => {
    const { user, dialog } = await open();
    await user.click(within(dialog).getByLabelText("Roll over unspent budget"));
    await user.click(within(dialog).getByLabelText("Meals & Dining"));
    await user.type(
      within(dialog).getByLabelText("Groceries carried into October 2026"),
      "75",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save rollover" }),
    );

    await waitFor(() =>
      expect(rolloverActions.saveRollover).toHaveBeenCalledTimes(1),
    );
    const values = vi.mocked(rolloverActions.saveRollover).mock
      .calls[0]?.[0] as Record<string, string>;
    expect(values).toMatchObject({
      month: "2026-10",
      enabled: "on",
      startMonth: "2026-10",
      categories: "Groceries,Dining",
      rollover_Groceries: "on",
      carry_Groceries: "75",
      carry_Dining: "",
    });
    expect(values.rollover_Dining).toBeUndefined();
    await waitFor(() =>
      expect(toast.success).toHaveBeenCalledWith("Rollover saved"),
    );
  });

  it("shows a bad amount next to its field without saving", async () => {
    const { user, dialog } = await open();
    await user.type(
      within(dialog).getByLabelText("Meals & Dining carried into October 2026"),
      "lots",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Save rollover" }),
    );
    expect(
      await within(dialog).findByText("Enter a valid amount, like 50.00"),
    ).toBeInTheDocument();
    expect(rolloverActions.saveRollover).not.toHaveBeenCalled();
  });
});
