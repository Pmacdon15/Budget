import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReceiptExportDialog } from "@/components/receipt-export/receipt-export-dialog";
import { presetRange } from "@/lib/receipt-export";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), warning: vi.fn(), success: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

async function openDialog() {
  const user = userEvent.setup();
  renderWithQuery(<ReceiptExportDialog />);
  await user.click(screen.getByRole("button", { name: /download receipts/i }));
  return user;
}

const zipButton = () => screen.getByRole("button", { name: /download \.zip/i });

describe("ReceiptExportDialog", () => {
  it("opens on this month with every summary format ticked", async () => {
    await openDialog();
    const month = presetRange("this-month");
    expect(screen.getByLabelText("From")).toHaveValue(month.from);
    expect(screen.getByLabelText("To")).toHaveValue(month.to);
    expect(screen.getByRole("button", { name: "This month" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    for (const label of ["PDF", "Excel", "CSV"]) {
      expect(screen.getByRole("checkbox", { name: label })).toBeChecked();
    }
    expect(zipButton()).toBeEnabled();
  });

  it("switches to a quick period", async () => {
    const user = await openDialog();
    await user.click(screen.getByRole("button", { name: "Last year" }));
    const year = presetRange("last-year");
    expect(screen.getByLabelText("From")).toHaveValue(year.from);
    expect(screen.getByLabelText("To")).toHaveValue(year.to);
  });

  it("explains a backwards period instead of downloading", async () => {
    const user = await openDialog();
    const from = screen.getByLabelText("From");
    await user.clear(from);
    await user.type(from, "2099-01-01");
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The start date must come before the end date",
    );
    expect(zipButton()).toBeDisabled();
  });

  it("asks only for the summaries left ticked, and says when nothing was spent", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        filename: "x.zip",
        summaries: [],
        receipts: [],
        expenditureCount: 0,
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const user = await openDialog();
    await user.click(screen.getByRole("checkbox", { name: "PDF" }));
    await user.click(screen.getByRole("checkbox", { name: "CSV" }));
    await user.click(zipButton());

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "Nothing was spent in this period.",
      ),
    );
    const month = presetRange("this-month");
    expect(fetch).toHaveBeenCalledWith(
      `/api/receipts/export?from=${month.from}&to=${month.to}&format=xlsx`,
      expect.anything(),
    );
  });

  it("shows the server's error as a toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Pick a shorter period." }, { status: 413 }),
      ),
    );
    const user = await openDialog();
    await user.click(zipButton());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Pick a shorter period."),
    );
  });
});
