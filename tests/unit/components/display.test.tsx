import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Wallet } from "lucide-react";
import { describe, expect, it, vi } from "vitest";
import { AuthShell } from "@/components/auth-shell";
import { Delta } from "@/components/delta";
import { EmptyState } from "@/components/empty-state";
import { Logo } from "@/components/logo";
import { PageHeader } from "@/components/page-header";
import { PrintButton } from "@/components/print-button";
import { Providers } from "@/components/providers";
import { StatCardSkeleton, TextSkeleton } from "@/components/skeletons";
import { StatCard } from "@/components/stat-card";

describe("Delta", () => {
  it("says when there is nothing to compare", () => {
    render(<Delta current={0} previous={0} goodWhen="up" />);
    expect(screen.getByText("No data last month")).toBeInTheDocument();
  });

  it("says when nothing changed", () => {
    render(<Delta current={500} previous={500} goodWhen="up" />);
    expect(screen.getByText("Same as last month")).toBeInTheDocument();
  });

  it("shows a rise in take-home as good", () => {
    render(<Delta current={300_000} previous={250_000} goodWhen="up" />);
    const amount = screen.getByText("$500.00");
    expect(amount.className).toMatch(/emerald/);
    expect(screen.getByText(/vs last month/)).toBeInTheDocument();
  });

  it("shows a rise in spending as bad", () => {
    render(<Delta current={12_000} previous={10_000} goodWhen="down" />);
    expect(screen.getByText("$20.00").className).toMatch(/rose/);
  });

  it("shows a drop in spending as good, using the absolute difference", () => {
    render(<Delta current={8_000} previous={10_000} goodWhen="down" />);
    expect(screen.getByText("$20.00").className).toMatch(/emerald/);
  });

  it("compares against a month with nothing recorded", () => {
    render(<Delta current={4_200} previous={0} goodWhen="up" />);
    expect(screen.getByText("$42.00")).toBeInTheDocument();
  });
});

describe("StatCard", () => {
  it("shows its label, value and hint", () => {
    render(
      <StatCard
        label="Take-home"
        value="$2,500.00"
        hint="3-mo avg"
        icon={Wallet}
      />,
    );
    expect(screen.getByText("Take-home")).toBeInTheDocument();
    expect(screen.getByText("$2,500.00")).toBeInTheDocument();
    expect(screen.getByText("3-mo avg")).toBeInTheDocument();
  });

  it("colors positive and negative tones", () => {
    const { rerender } = render(
      <StatCard label="Left" value="$1" icon={Wallet} tone="positive" />,
    );
    expect(screen.getByText("$1").className).toMatch(/emerald/);
    rerender(
      <StatCard label="Left" value="-$1" icon={Wallet} tone="negative" />,
    );
    expect(screen.getByText("-$1").className).toMatch(/rose/);
  });

  it("omits an empty hint", () => {
    const { container } = render(
      <StatCard label="Bills" value="$0.00" icon={Wallet} />,
    );
    expect(container.querySelectorAll(".text-xs")).toHaveLength(0);
  });
});

describe("EmptyState", () => {
  it("shows the title, description and any actions", () => {
    render(
      <EmptyState icon={Wallet} title="Nothing yet" description="Add one">
        <button type="button">Add</button>
      </EmptyState>,
    );
    expect(
      screen.getByRole("heading", { name: "Nothing yet" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Add one")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add" })).toBeInTheDocument();
  });
});

describe("PageHeader", () => {
  it("renders the title, description and actions", () => {
    render(
      <PageHeader title="Report" description="October">
        <button type="button">Print</button>
      </PageHeader>,
    );
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent(
      "Report",
    );
    expect(screen.getByText("October")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Print" })).toBeInTheDocument();
  });

  it("renders just a title", () => {
    const { container } = render(<PageHeader title="Only" />);
    expect(container.querySelector("p")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("Skeletons", () => {
  it("keeps a stat card's label in the static shell while its number loads", () => {
    const { container } = render(
      <StatCardSkeleton label="Take-home" icon={Wallet} />,
    );
    expect(screen.getByText("Take-home")).toBeInTheDocument();
    expect(container.querySelector("[aria-busy=true]")).not.toBeNull();
    expect(container.querySelector("svg")).not.toBeNull();
  });

  it("sizes a text placeholder inline", () => {
    const { container } = render(<TextSkeleton className="w-24" />);
    expect(container.firstChild).toHaveClass("inline-block", "w-24");
  });
});

describe("Logo", () => {
  it("is decorative and accepts extra classes", () => {
    const { container } = render(<Logo className="size-10" />);
    const svg = container.querySelector("svg");
    expect(svg).toHaveAttribute("aria-hidden", "true");
    expect(svg?.getAttribute("class")).toContain("size-10");
  });
});

describe("AuthShell", () => {
  it("wraps the sign-in widget with the app's branding", () => {
    render(
      <AuthShell>
        <div>Clerk widget</div>
      </AuthShell>,
    );
    expect(screen.getByRole("heading", { name: "Budget" })).toBeInTheDocument();
    expect(screen.getByText("Clerk widget")).toBeInTheDocument();
  });
});

describe("Providers", () => {
  it("renders the app inside the query, theme and tooltip providers", () => {
    render(
      <Providers>
        <p>App content</p>
      </Providers>,
    );
    expect(screen.getByText("App content")).toBeInTheDocument();
  });
});

describe("PrintButton", () => {
  it("opens the browser's print dialog", async () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => {});
    render(<PrintButton />);
    await userEvent.click(screen.getByRole("button", { name: /print/i }));
    expect(print).toHaveBeenCalledOnce();
  });
});
