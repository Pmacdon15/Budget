import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import AppLayout from "@/app/(app)/layout";
import RootLayout, { metadata, viewport } from "@/app/layout";
import SignInPage, {
  metadata as signInMeta,
} from "@/app/sign-in/[[...sign-in]]/page";
import SignUpPage, {
  metadata as signUpMeta,
} from "@/app/sign-up/[[...sign-up]]/page";

vi.mock("@clerk/nextjs", () => ({
  ClerkProvider: ({
    children,
    signInUrl,
    signUpUrl,
  }: {
    children: ReactNode;
    signInUrl: string;
    signUpUrl: string;
  }) => (
    <div data-clerk-provider data-sign-in={signInUrl} data-sign-up={signUpUrl}>
      {children}
    </div>
  ),
  UserButton: () => <button type="button">Account</button>,
  SignIn: () => <form aria-label="Clerk sign in" />,
  SignUp: () => <form aria-label="Clerk sign up" />,
}));

vi.mock("next/font/google", () => ({
  Geist: () => ({ variable: "font-sans-var" }),
  Geist_Mono: () => ({ variable: "font-mono-var" }),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn() }),
}));

describe("RootLayout", () => {
  it("wraps the app in Clerk and the app providers", () => {
    const html = renderToStaticMarkup(
      <RootLayout>
        <p>Page</p>
      </RootLayout>,
    );
    expect(html).toMatch(/^<html lang="en-CA">/);
    expect(html).toContain('class="font-sans-var font-mono-var antialiased"');
    expect(html).toContain('data-sign-in="/sign-in"');
    expect(html).toContain('data-sign-up="/sign-up"');
    expect(html).toContain("<p>Page</p>");
  });

  it("sets the page title template and theme colors", () => {
    expect(metadata.title).toEqual({
      default: "Budget",
      template: "%s · Budget",
    });
    expect(viewport.themeColor).toHaveLength(2);
  });
});

describe("AppLayout", () => {
  it("shows the header with navigation, month switcher and account menu", () => {
    render(
      <AppLayout>
        <p>Dashboard</p>
      </AppLayout>,
    );
    expect(screen.getAllByRole("link", { name: "Overview" }).length).toBe(2);
    expect(
      screen.getByRole("button", { name: "Previous month" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Toggle dark mode" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Account" })).toBeVisible();
    expect(screen.getByRole("main")).toHaveTextContent("Dashboard");
  });
});

describe("auth pages", () => {
  it("renders Clerk's sign-in form", () => {
    render(<SignInPage />);
    expect(
      screen.getByRole("form", { name: "Clerk sign in" }),
    ).toBeInTheDocument();
    expect(signInMeta.title).toBe("Sign in");
  });

  it("renders Clerk's sign-up form", () => {
    render(<SignUpPage />);
    expect(
      screen.getByRole("form", { name: "Clerk sign up" }),
    ).toBeInTheDocument();
    expect(signUpMeta.title).toBe("Sign up");
  });
});
