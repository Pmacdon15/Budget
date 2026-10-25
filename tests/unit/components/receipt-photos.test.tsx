import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DownloadPhotosButton } from "@/components/receipt-photos/download-photos-button";
import { renderWithQuery } from "../../helpers/render-with-query";

vi.mock("sonner", () => ({
  toast: { info: vi.fn(), error: vi.fn(), warning: vi.fn() },
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

const button = () => screen.getByRole("button", { name: /receipt photos/i });

describe("DownloadPhotosButton", () => {
  it("is disabled until the choices are usable", () => {
    renderWithQuery(
      <DownloadPhotosButton from="2026-10" to="2026-10" categories={[]} />,
    );
    expect(button()).toBeDisabled();
  });

  it("says there are no photos instead of downloading an empty zip", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ filename: "x.zip", photos: [] }),
    );
    vi.stubGlobal("fetch", fetch);
    const append = vi.spyOn(document.body, "append");

    renderWithQuery(
      <DownloadPhotosButton
        from="2026-10"
        to="2026-10"
        categories={["Groceries"]}
      />,
    );
    await userEvent.setup().click(button());

    await waitFor(() =>
      expect(toast.info).toHaveBeenCalledWith(
        "There are no receipt photos for these months and categories.",
      ),
    );
    expect(fetch).toHaveBeenCalledWith(
      "/api/receipts/photos?from=2026-10&to=2026-10&category=Groceries",
      expect.anything(),
    );
    expect(append).not.toHaveBeenCalled(); // no download link was clicked
    expect(button()).toBeEnabled();
  });

  it("shows the server's error as a toast", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json({ error: "Too many photos" }, { status: 413 }),
      ),
    );
    renderWithQuery(
      <DownloadPhotosButton
        from="2026-01"
        to="2026-10"
        categories={["Groceries"]}
      />,
    );
    await userEvent.setup().click(button());
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Too many photos"),
    );
  });

  it("shows progress while zipping", async () => {
    let release: (r: Response) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        url.startsWith("/api/receipts/photos")
          ? Response.json({
              filename: "x.zip",
              photos: [{ filename: "a.jpg", url: "/api/receipts/1/image" }],
            })
          : new Promise<Response>((resolve) => {
              release = resolve;
            }),
      ),
    );
    renderWithQuery(
      <DownloadPhotosButton
        from="2026-10"
        to="2026-10"
        categories={["Groceries"]}
      />,
    );
    await userEvent.setup().click(button());
    expect(
      await screen.findByRole("button", { name: "Zipping 0 of 1…" }),
    ).toBeDisabled();
    release(new Response("Not found", { status: 404 }));
    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't download any of the receipt photos. Try again.",
      ),
    );
  });
});
