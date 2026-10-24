import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as expenseActions from "@/actions/expenses";
import { ExportDialog, exportHref } from "@/components/export-dialog";
import {
  ExpenseDialog,
  type ScannedReceipt,
} from "@/components/forms/expense-dialog";
import {
  ScanReceiptButton,
  scanReceipt,
} from "@/components/scan-receipt-button";
import { CATEGORY_NAMES } from "@/lib/categories";
import { compressImage } from "@/lib/compress-image";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("@/actions/expenses", () => ({
  createExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}));
vi.mock("@/lib/compress-image", () => ({ compressImage: vi.fn() }));

const PHOTO = "receipts/user_a/2b7e1c2a-9f2d-4c1e-8a3b-1d2e3f4a5b6c.jpg";

const scan = (over: Partial<ScannedReceipt> = {}): ScannedReceipt => ({
  image: PHOTO,
  recognised: true,
  previewUrl: "blob:preview",
  fields: {
    merchant: "Costco",
    purchasedOn: "2026-10-05",
    totalCents: 11_300,
    subtotalCents: 10_000,
    taxCents: 1_300,
    category: "Groceries",
    rawText: "COSTCO",
  },
  ...over,
});

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-23T18:00:00Z"));
  vi.mocked(expenseActions.createExpense).mockResolvedValue({ ok: true });
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("ExpenseDialog with a scanned receipt", () => {
  it("pre-fills from the receipt and saves what was read with it", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        scan={scan()}
        open
        onOpenChange={() => {}}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Scanned receipt",
    );
    expect(dialog).toHaveTextContent("Filled in by AI");
    expect(dialog).toHaveTextContent("Subtotal $100.00 · Tax $13.00");
    expect(within(dialog).getByAltText("Receipt")).toHaveAttribute(
      "src",
      "blob:preview",
    );
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Costco");
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("113.00");
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-05");

    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith({
        description: "Costco",
        amount: "113.00",
        spentOn: "2026-10-05",
        category: "Groceries",
        receiptImage: PHOTO,
        receiptMerchant: "Costco",
        receiptPurchasedOn: "2026-10-05",
        receiptSubtotal: "100.00",
        receiptTax: "13.00",
        receiptTotal: "113.00",
        receiptText: "COSTCO",
      }),
    );
    expect(toast.success).toHaveBeenCalledWith("Receipt saved");
  });

  it("still attaches the photo when nothing could be read", async () => {
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        scan={scan({ recognised: false, fields: {} })}
        open
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Couldn't make out this receipt");
    expect(dialog).toHaveTextContent("Photo attached");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("");
    expect(within(dialog).getByLabelText("Date")).toHaveValue("2026-10-23");
  });
});

describe("scanReceipt", () => {
  it("posts the photo and returns the reading", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        image: PHOTO,
        recognised: true,
        fields: { totalCents: 5 },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    expect(await scanReceipt(new Blob(["x"]))).toEqual({
      image: PHOTO,
      recognised: true,
      fields: { totalCents: 5 },
    });
    const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/receipts");
    expect((init.body as FormData).get("file")).toBeInstanceOf(Blob);
  });

  it("surfaces the server's error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ error: "Too large" }, { status: 413 })),
    );
    await expect(scanReceipt(new Blob(["x"]))).rejects.toThrow("Too large");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 500 })),
    );
    await expect(scanReceipt(new Blob(["x"]))).rejects.toThrow(
      "Couldn't scan that receipt. Try again.",
    );
  });
});

describe("ScanReceiptButton", () => {
  it("compresses, scans, then opens the pre-filled form", async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockResolvedValue(new Blob(["jpeg"]));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({
          image: PHOTO,
          recognised: true,
          fields: { merchant: "Esso" },
        }),
      ),
    );
    renderWithQuery(<ScanReceiptButton month="2026-10" />);

    await user.upload(
      screen.getByLabelText("Choose a photo of the receipt"),
      new File(["raw"], "receipt.jpg", { type: "image/jpeg" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Esso");
    expect(compressImage).toHaveBeenCalled();
  });

  it("shows why a scan failed", async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockRejectedValue(
      new Error("That file isn't an image."),
    );
    renderWithQuery(<ScanReceiptButton month="2026-10" />);
    await user.upload(
      screen.getByLabelText("Choose a photo of the receipt"),
      new File(["raw"], "receipt.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That file isn't an image."),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("exportHref", () => {
  it("builds the download link with one category per box", () => {
    expect(
      exportHref({
        format: "pdf",
        from: "2026-01",
        to: "2026-10",
        categories: ["Groceries", "Dining"],
        photos: true,
      }),
    ).toEqual({
      href: "/expenses/export?format=pdf&from=2026-01&to=2026-10&category=Groceries&category=Dining&photos=1",
    });
  });

  it("only sends photos for a PDF, and explains invalid choices", () => {
    expect(
      exportHref({
        format: "csv",
        from: "2026-10",
        to: "2026-10",
        categories: ["Groceries"],
        photos: true,
      }),
    ).toEqual({
      href: "/expenses/export?format=csv&from=2026-10&to=2026-10&category=Groceries",
    });
    expect(
      exportHref({
        format: "csv",
        from: "2026-10",
        to: "2026-10",
        categories: [],
        photos: false,
      }),
    ).toEqual({ error: "Pick at least one category" });
  });
});

describe("ExportDialog", () => {
  it("lets you tick categories and pick a format", async () => {
    const user = userEvent.setup();
    renderWithQuery(<ExportDialog month="2026-10" />);
    await user.click(screen.getByRole("button", { name: "Download" }));
    const dialog = await screen.findByRole("dialog");

    const boxes = within(dialog).getAllByRole("checkbox");
    expect(boxes).toHaveLength(CATEGORY_NAMES.length);
    expect(boxes.every((b) => (b as HTMLInputElement).checked)).toBe(true);

    await user.click(within(dialog).getByRole("button", { name: "None" }));
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Pick at least one category",
    );
    expect(within(dialog).queryByRole("link")).toBeNull();

    await user.click(within(dialog).getByRole("checkbox", { name: "Dining" }));
    await user.click(within(dialog).getByRole("checkbox", { name: "Health" }));
    await user.click(within(dialog).getByRole("button", { name: "Excel" }));

    expect(
      within(dialog).getByRole("link", { name: "Download" }),
    ).toHaveAttribute(
      "href",
      "/expenses/export?format=xlsx&from=2026-10&to=2026-10&category=Dining&category=Health",
    );
    expect(
      within(dialog).queryByRole("checkbox", {
        name: "Include receipt photos",
      }),
    ).toBeNull();

    await user.click(within(dialog).getByRole("button", { name: "PDF" }));
    await user.click(
      within(dialog).getByRole("checkbox", { name: "Include receipt photos" }),
    );
    expect(
      within(dialog).getByRole("link", { name: "Download" }),
    ).toHaveAttribute(
      "href",
      "/expenses/export?format=pdf&from=2026-10&to=2026-10&category=Dining&category=Health&photos=1",
    );
  });
});

describe("splitting a receipt across categories", () => {
  it("opens with the AI's split and saves it", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        open
        scan={scan({
          fields: {
            merchant: "Superstore",
            totalCents: 11_300,
            category: "Groceries",
            splits: [
              { category: "Groceries", amountCents: 8_000 },
              { category: "Alcohol", amountCents: 3_300 },
            ],
          },
        })}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Split across categories");
    expect(within(dialog).getByLabelText("Part 1 amount")).toHaveValue("80.00");
    expect(within(dialog).getByLabelText("Part 2 amount")).toHaveValue("33.00");
    expect(dialog).toHaveTextContent("Fully split");
    expect(within(dialog).queryByLabelText("Category")).toBeNull();

    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "113.00",
          category: "Groceries",
          splits: JSON.stringify([
            { category: "Groceries", amount: "80.00" },
            { category: "Alcohol", amount: "33.00" },
          ]),
        }),
      ),
    );
  });

  it("lets a typed-in expense be split, and checks the parts add up", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        trigger={<button type="button">Add</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog");

    await user.type(within(dialog).getByLabelText("Description"), "Superstore");
    await user.type(within(dialog).getByLabelText("Amount"), "50.00");
    await user.click(
      within(dialog).getByRole("button", { name: "Split across categories" }),
    );

    const first = within(dialog).getByLabelText("Part 1 amount");
    expect(first).toHaveValue("50.00");
    await user.clear(first);
    await user.type(first, "40");
    expect(dialog).toHaveTextContent("$10.00 left to split");

    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "Enter a valid amount, like 1250.00",
    );
    expect(expenseActions.createExpense).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText("Part 2 amount"), "12");
    expect(dialog).toHaveTextContent("$2.00 over the total");
    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    expect(within(dialog).getByRole("alert")).toHaveTextContent(
      "The parts add up to $52.00 but the total is $50.00",
    );

    await user.clear(within(dialog).getByLabelText("Part 2 amount"));
    await user.type(within(dialog).getByLabelText("Part 2 amount"), "10");
    await user.click(
      within(dialog).getByRole("button", { name: "Add a category" }),
    );
    expect(within(dialog).getByLabelText("Part 3 amount")).toHaveValue("");
    await user.click(
      within(dialog).getByRole("button", { name: "Remove part 3" }),
    );

    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: "50.00",
          category: "Groceries",
          splits: JSON.stringify([
            { category: "Groceries", amount: "40" },
            { category: "Alcohol", amount: "10" },
          ]),
        }),
      ),
    );
  });

  it("can go back to a single category", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        trigger={<button type="button">Add</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog");
    await user.click(
      within(dialog).getByRole("button", { name: "Split across categories" }),
    );
    await user.click(
      within(dialog).getByRole("button", { name: "One category" }),
    );
    expect(within(dialog).getByLabelText("Category")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("Part 1 amount")).toBeNull();
  });
});

describe("scanning with the camera or the photo library", () => {
  const scanReturns = (body: unknown) =>
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(body)),
    );

  it("offers a camera input and a library input", () => {
    renderWithQuery(<ScanReceiptButton month="2026-10" />);
    expect(
      screen.getByLabelText("Take a photo of the receipt"),
    ).toHaveAttribute("capture", "environment");
    expect(
      screen.getByLabelText("Choose a photo of the receipt"),
    ).not.toHaveAttribute("capture");
  });

  it("scans from the camera too", async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockResolvedValue(new Blob(["jpeg"]));
    scanReturns({
      image: PHOTO,
      recognised: true,
      fields: { merchant: "Esso" },
    });
    renderWithQuery(<ScanReceiptButton month="2026-10" />);
    await user.upload(
      screen.getByLabelText("Take a photo of the receipt"),
      new File(["raw"], "camera.jpg", { type: "image/jpeg" }),
    );
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByLabelText("Description")).toHaveValue("Esso");
  });

  it("lets Add expense scan a receipt into the open form", async () => {
    const user = userEvent.setup();
    vi.mocked(compressImage).mockResolvedValue(new Blob(["jpeg"]));
    scanReturns({
      image: PHOTO,
      recognised: true,
      fields: {
        merchant: "Shell",
        totalCents: 6_000,
        category: "Transportation",
      },
    });
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        trigger={<button type="button">Add</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Add" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Have a receipt?");
    expect(
      within(dialog).getByRole("button", { name: "Take photo" }),
    ).toBeVisible();

    await user.upload(
      within(dialog).getByLabelText("Take a photo of the receipt"),
      new File(["raw"], "camera.jpg", { type: "image/jpeg" }),
    );
    await waitFor(() =>
      expect(within(dialog).getByLabelText("Description")).toHaveValue("Shell"),
    );
    expect(within(dialog).getByLabelText("Amount")).toHaveValue("60.00");
    expect(within(dialog).getByRole("heading")).toHaveTextContent(
      "Scanned receipt",
    );
    expect(dialog).not.toHaveTextContent("Have a receipt?");

    await user.click(
      within(dialog).getByRole("button", { name: "Add expense" }),
    );
    await waitFor(() =>
      expect(expenseActions.createExpense).toHaveBeenCalledWith(
        expect.objectContaining({
          description: "Shell",
          category: "Transportation",
          receiptImage: PHOTO,
        }),
      ),
    );
  });

  it("doesn't offer scanning when editing", async () => {
    const user = userEvent.setup();
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        expense={{
          id: "e1",
          month: "2026-10",
          spentOn: "2026-10-05",
          description: "Gas",
          category: "Transportation",
          amountCents: 5_000,
          receiptId: null,
        }}
        trigger={<button type="button">Edit</button>}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Edit" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).not.toHaveTextContent("Have a receipt?");
  });

  it("says when reading is unavailable rather than blaming the photo", async () => {
    renderWithQuery(
      <ExpenseDialog
        month="2026-10"
        open
        scan={scan({ recognised: false, unavailable: true, fields: {} })}
      />,
    );
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(
      "Receipt reading isn't available right now",
    );
  });

  it("passes the unavailable flag through from the server", async () => {
    scanReturns({
      image: PHOTO,
      recognised: false,
      fields: {},
      unavailable: true,
    });
    expect(await scanReceipt(new Blob(["x"]))).toEqual({
      image: PHOTO,
      recognised: false,
      fields: {},
      unavailable: true,
    });
  });
});
