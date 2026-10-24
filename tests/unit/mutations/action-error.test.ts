import { describe, expect, it } from "vitest";
import { ActionError, unwrap } from "@/mutations/action-error";

describe("unwrap", () => {
  it("does nothing for a successful result", () => {
    expect(() => unwrap({ ok: true })).not.toThrow();
  });

  it("throws an ActionError carrying the message and field errors", () => {
    let caught: unknown;
    try {
      unwrap({
        ok: false,
        error: "Name is required",
        fieldErrors: { name: ["Name is required"] },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(ActionError);
    expect(caught).toMatchObject({
      name: "ActionError",
      message: "Name is required",
      fieldErrors: { name: ["Name is required"] },
    });
  });

  it("defaults to no field errors", () => {
    expect(() => unwrap({ ok: false, error: "Nope" })).toThrow(
      expect.objectContaining({ message: "Nope", fieldErrors: {} }),
    );
  });
});
