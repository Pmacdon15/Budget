import { revalidatePath } from "next/cache";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { runAction } from "@/actions/run-action";
import { NotFoundError, UnauthorizedError } from "@/dal/errors";

describe("runAction", () => {
  it("reports success and refreshes the whole app", async () => {
    const mutate = vi.fn(async () => {});
    expect(await runAction(mutate)).toEqual({ ok: true });
    expect(mutate).toHaveBeenCalledOnce();
    expect(revalidatePath).toHaveBeenCalledWith("/", "layout");
  });

  it("turns validation errors into field errors", async () => {
    const schema = z.object({
      name: z.string().min(1, "Name is required"),
      amount: z.number({ error: "Enter an amount" }),
    });
    const result = await runAction(async () => {
      schema.parse({ name: "" });
    });
    expect(result).toEqual({
      ok: false,
      error: "Name is required",
      fieldErrors: {
        name: ["Name is required"],
        amount: ["Enter an amount"],
      },
    });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("passes expected DAL errors through with their message", async () => {
    expect(
      await runAction(async () => {
        throw new UnauthorizedError();
      }),
    ).toEqual({
      ok: false,
      error: "You're signed out. Sign in again and retry.",
    });
    expect(
      await runAction(async () => {
        throw new NotFoundError();
      }),
    ).toEqual({ ok: false, error: "That item no longer exists." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("hides unexpected errors behind a generic message and logs them", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const boom = new Error("connection refused at 10.0.0.1");
    const result = await runAction(async () => {
      throw boom;
    });
    expect(result).toEqual({
      ok: false,
      error: "Something went wrong. Please try again.",
    });
    expect(log).toHaveBeenCalledWith(boom);
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("DAL errors", () => {
  it("are named and carry friendly messages", () => {
    expect(new UnauthorizedError().name).toBe("UnauthorizedError");
    expect(new NotFoundError().name).toBe("NotFoundError");
    expect(new NotFoundError("Gone").message).toBe("Gone");
  });
});
