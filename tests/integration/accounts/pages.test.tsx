import { get } from "@vercel/blob";
import { describe, expect, it, vi } from "vitest";
import { createAccount } from "@/actions/accounts";
import { setBankBalance } from "@/actions/bank-balance";
import AccountsPage from "@/app/(app)/accounts/page";
import OverviewPage from "@/app/(app)/page";
import { GET as reportCsv } from "@/app/(app)/report/csv/route";
import ReportPage from "@/app/(app)/report/page";
import ReviewPage from "@/app/(app)/review/page";
import { GET as statementPdf } from "@/app/api/statements/[id]/pdf/route";
import { insertIncome } from "@/db/income";
import type { AccountFormValues } from "@/lib/accounts";
import { currentMonth } from "@/lib/month";
import { recordStatement } from "@/mcp/account-tools";
import { signInAs, signOut } from "../../helpers/auth";
import {
  pendingSearchParams,
  renderPage,
  renderShell,
  searchParams,
  textOf,
} from "../../helpers/render-page";
import { rows } from "../../helpers/test-db";

vi.mock("@/lib/statement-store", () => ({
  putStatementPdf: vi.fn(),
  deleteStatementPdf: vi.fn(),
}));
vi.mock("@vercel/blob", () => ({ get: vi.fn() }));

type Page = (props: {
  searchParams: ReturnType<typeof searchParams>;
}) => React.ReactElement;

const render = async (Page: Page, month = currentMonth()) =>
  textOf(await renderPage(Page({ searchParams: searchParams(month) })))
    // Currency symbols render with a non-breaking space in some locales.
    .replace(/\s/g, " ");

const caller = { userId: "user_a", client: "Claude" };

/** This month: $3,000 take-home, nothing spent, so the budget has $3,000 left. */
const takeHome = () =>
  insertIncome("user_a", {
    month: currentMonth(),
    label: "Paycheque",
    amountCents: 300_000,
    receivedOn: null,
  });

const visa: AccountFormValues = {
  name: "Visa",
  type: "credit_card",
  institution: "RBC",
  lastFour: "1234",
  balance: "4,000",
};

describe("Accounts page", () => {
  it("has its heading in the static shell but no data", async () => {
    await createAccount({ name: "Everyday", type: "chequing", balance: "10" });
    const text = textOf(
      await renderShell(AccountsPage({ searchParams: pendingSearchParams() })),
    );
    expect(text).toContain("Accounts");
    expect(text).toContain("Transfers");
    expect(text).not.toContain("Everyday");
  });

  it("shows an empty state before any accounts", async () => {
    expect(await render(AccountsPage)).toContain("No accounts yet");
  });

  it("lists accounts with net chequing and what's owed", async () => {
    await createAccount({
      name: "Everyday",
      type: "chequing",
      institution: "TD",
      lastFour: "9876",
      balance: "1,200",
    });
    await createAccount({ ...visa, minimumPayment: "25" });
    const text = await render(AccountsPage);
    expect(text).toContain("Everyday");
    expect(text).toContain("Chequing · TD · ••9876");
    expect(text).toContain("Main chequing");
    expect(text).toContain("Net chequing");
    expect(text).toContain("$1,200.00");
    expect(text).toContain("Owed on credit");
    expect(text).toContain("$4,000.00");
    expect(text).toContain("Minimum payment");
    expect(text).toContain("Record transfer");
  });

  it("links a statement's PDF for download", async () => {
    await createAccount(visa);
    await recordStatement(caller, {
      institution: "RBC",
      last_four: "1234",
      closing_date: "2026-10-15",
      balance: 842.19,
      pdf_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
    });
    const html = await renderPage(
      AccountsPage({ searchParams: searchParams() }),
    );
    const [statement] = await rows("select id from account_statements");
    expect(html).toContain(`/api/statements/${statement?.id}/pdf`);
    expect(textOf(html)).toContain("Statements");
  });

  it("sends signed-out visitors to sign-in", async () => {
    signOut();
    await expect(render(AccountsPage)).rejects.toMatchObject({
      url: "/sign-in",
    });
  });
});

describe("leftover spend on the Overview, Report and CSV", () => {
  it("is unchanged with no accounts", async () => {
    await takeHome();
    const text = await render(OverviewPage);
    expect(text).toContain("$3,000.00");
    expect(text).toContain("100% of take-home");
  });

  it("is held to net chequing across several accounts, ignoring credit", async () => {
    await takeHome();
    await createAccount({ name: "Everyday", type: "chequing", balance: "700" });
    await createAccount({ name: "Joint", type: "chequing", balance: "300" });
    await createAccount(visa); // $4,000 owed doesn't count
    const text = await render(OverviewPage);
    expect(text).toContain("All that's in chequing");
    expect(text).toContain("$1,000.00 left for the next");
    expect(text).toContain("Net chequing across 2 accounts: $1,000.00");
  });

  it("is zero, with zero safe to spend, when net chequing is negative", async () => {
    await takeHome();
    await createAccount({ name: "Everyday", type: "chequing", balance: "200" });
    await createAccount({ name: "Joint", type: "chequing", balance: "-500" });
    await createAccount({ ...visa, balance: "-100" }); // a card in credit doesn't help
    const text = await render(OverviewPage);
    expect(text).toContain("Chequing is below zero");
    expect(text).toMatch(/Left over \$0\.00/);
    expect(text).toContain("Safe to spend $0.00 / day");
    expect(text).toContain("Your chequing is $300.00 below zero");
    expect(text).not.toContain("$3,000.00 left for the next");
  });

  it("is zero when net chequing is exactly zero", async () => {
    await takeHome();
    await createAccount({ name: "Everyday", type: "chequing", balance: "0" });
    const text = await render(OverviewPage);
    expect(text).toMatch(/Left over \$0\.00/);
    expect(text).toContain("Safe to spend $0.00 / day");
  });

  it("is corrected on the Report and in its CSV too", async () => {
    await takeHome();
    await setBankBalance({ balance: "-25" });
    const report = await render(ReportPage);
    expect(report).toMatch(/Left over \$0\.00/);
    expect(report).not.toMatch(/Left over \$3,000\.00/);

    const csv = await (
      await reportCsv(
        new Request(`https://budget.test/report/csv?month=${currentMonth()}`),
      )
    ).text();
    expect(csv).toContain("Left over,,0.00");
  });

  it("leaves months that are over as they were", async () => {
    await insertIncome("user_a", {
      month: "2025-01",
      label: "Paycheque",
      amountCents: 300_000,
      receivedOn: null,
    });
    await setBankBalance({ balance: "-25" });
    expect(await render(ReportPage, "2025-01")).toMatch(
      /Left over \$3,000\.00/,
    );
  });
});

describe("Review page", () => {
  it("lists an account the AI proposed, with its statement", async () => {
    await recordStatement(caller, {
      institution: "Amex",
      last_four: "1005",
      account_type: "credit_card",
      closing_date: "2026-10-15",
      balance: 120,
      pdf_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
      source: "Amex: Your statement is ready",
    });
    const text = await render(ReviewPage);
    expect(text).toContain("Amex Credit card ••1005");
    expect(text).toContain("New account");
    expect(text).toContain("PDF attached");
    expect(text).toContain("from Claude");
    expect(text).toContain("Add account");
    expect(text).not.toContain("Nothing to review");
  });
});

describe("GET /api/statements/[id]/pdf", () => {
  const download = (id: string) =>
    statementPdf(new Request(`https://budget.test/api/statements/${id}/pdf`), {
      params: Promise.resolve({ id }),
    });

  async function savedStatement() {
    await createAccount(visa);
    await recordStatement(caller, {
      institution: "RBC",
      last_four: "1234",
      closing_date: "2026-10-15",
      balance: 842.19,
      pdf_base64: Buffer.from("%PDF-1.4 x").toString("base64"),
    });
    const [row] = await rows("select id, pdf_pathname from account_statements");
    return { id: String(row?.id), pathname: String(row?.pdf_pathname) };
  }

  it("downloads the owner's PDF from the private store", async () => {
    const { id, pathname } = await savedStatement();
    vi.mocked(get).mockResolvedValue({
      statusCode: 200,
      stream: new Blob(["%PDF-1.4 x"]).stream(),
      blob: { contentType: "application/pdf", size: 10 },
    } as never);
    const response = await download(id);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/pdf");
    expect(response.headers.get("Content-Disposition")).toContain("attachment");
    expect(response.headers.get("Cache-Control")).toBe("private, no-cache");
    expect(vi.mocked(get)).toHaveBeenCalledWith(pathname, {
      access: "private",
    });
  });

  it("is not found for someone else's statement or a bad id", async () => {
    const { id } = await savedStatement();
    vi.mocked(get).mockClear();
    signInAs("user_b");
    expect((await download(id)).status).toBe(404);
    expect((await download("not-an-id")).status).toBe(404);
    expect(vi.mocked(get)).not.toHaveBeenCalled();
  });

  it("is unauthorized when signed out", async () => {
    const { id } = await savedStatement();
    signOut();
    expect((await download(id)).status).toBe(401);
  });
});
