import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { beforeEach, describe, expect, it, vi } from "vitest";
import * as actions from "@/actions/bill-payments";
import { BillPaidToggle } from "@/components/bills/bill-paid-toggle";
import { BillsPaidSummary } from "@/components/bills/bills-paid-summary";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/bill-payments", () => ({
  markBillPaid: vi.fn(),
  unmarkBillPaid: vi.fn(),
}));

const ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.mocked(actions.markBillPaid).mockResolvedValue({ ok: true });
  vi.mocked(actions.unmarkBillPaid).mockResolvedValue({ ok: true });
});

const toggle = (paid: boolean) =>
  renderWithQuery(
    <BillPaidToggle fixedItemId={ID} name="Rent" month="2026-10" paid={paid} />,
  );

describe("BillPaidToggle", () => {
  it("marks an unpaid bill paid for the month", async () => {
    toggle(false);
    const button = screen.getByRole("button", {
      name: "Mark Rent paid for October 2026",
    });
    expect(button).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(button);
    await waitFor(() =>
      expect(actions.markBillPaid).toHaveBeenCalledWith({
        fixedItemId: ID,
        month: "2026-10",
      }),
    );
    expect(actions.unmarkBillPaid).not.toHaveBeenCalled();
  });

  it("takes the paid mark off", async () => {
    toggle(true);
    const button = screen.getByRole("button", { name: /Rent is paid/ });
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(button).toHaveTextContent("Paid");
    await userEvent.click(button);
    await waitFor(() =>
      expect(actions.unmarkBillPaid).toHaveBeenCalledWith({
        fixedItemId: ID,
        month: "2026-10",
      }),
    );
  });

  it("shows the server's error", async () => {
    vi.mocked(actions.markBillPaid).mockResolvedValue({
      ok: false,
      error: "Not found",
    });
    toggle(false);
    await userEvent.click(screen.getByRole("button", { name: /Mark Rent/ }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Not found"));
  });
});

describe("BillsPaidSummary", () => {
  it("says how many are paid and what's still due", () => {
    render(
      <BillsPaidSummary
        summary={{
          paidCount: 1,
          totalCount: 3,
          paidCents: 150_000,
          dueCents: 10_500,
        }}
      />,
    );
    expect(screen.getByText("1 of 3 paid · $105.00 still due")).toBeVisible();
  });

  it("says when everything is paid", () => {
    render(
      <BillsPaidSummary
        summary={{ paidCount: 2, totalCount: 2, paidCents: 1, dueCents: 0 }}
      />,
    );
    expect(screen.getByText("2 of 2 paid · nothing left to pay")).toBeVisible();
  });
});
