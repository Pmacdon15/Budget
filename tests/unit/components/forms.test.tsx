import { useMutation } from "@tanstack/react-query";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { toast } from "sonner";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { ConfirmAction } from "@/components/forms/confirm-action";
import { Field, MoneyInput } from "@/components/forms/fields";
import { FieldError, FormDialog } from "@/components/forms/form-dialog";
import { ActionError } from "@/mutations/action-error";
import { renderWithQuery } from "../../helpers/render-with-query";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  amount: z.string().regex(/^\d+$/, "Whole dollars only"),
});
type Values = z.input<typeof schema>;

function TestForm({ save }: { save: (values: Values) => Promise<void> }) {
  const mutation = useMutation<void, ActionError, Values>({ mutationFn: save });
  return (
    <FormDialog
      trigger={<button type="button">Open</button>}
      title="Add a thing"
      description="Something to save."
      submitLabel="Save"
      successMessage="Saved!"
      schema={schema}
      mutation={mutation}
    >
      <Field label="Name" htmlFor="name">
        <input id="name" name="name" />
        <FieldError name="name" />
      </Field>
      <Field label="Amount" htmlFor="amount" hint="Dollars">
        <MoneyInput id="amount" name="amount" />
        <FieldError name="amount" />
      </Field>
    </FormDialog>
  );
}

async function openForm(save = vi.fn(async (_values: Values) => {})) {
  const user = userEvent.setup();
  renderWithQuery(<TestForm save={save} />);
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Add a thing" });
  return { user, save, dialog };
}

describe("FormDialog", () => {
  it("opens from its trigger with the title, description and fields", async () => {
    const { dialog } = await openForm();
    expect(within(dialog).getByText("Something to save.")).toBeVisible();
    expect(within(dialog).getByLabelText("Name")).toBeVisible();
    expect(within(dialog).getByLabelText("Amount")).toHaveAttribute(
      "inputmode",
      "decimal",
    );
    expect(within(dialog).getByText("Dollars")).toBeVisible();
  });

  it("validates in the browser before calling the server", async () => {
    const { user, save, dialog } = await openForm();
    await user.type(within(dialog).getByLabelText("Amount"), "12.5");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const alerts = within(dialog).getAllByRole("alert");
    expect(alerts.map((a) => a.textContent)).toEqual([
      "Name is required",
      "Whole dollars only",
    ]);
    expect(save).not.toHaveBeenCalled();
  });

  it("sends the raw form values, then closes and confirms", async () => {
    const { user, save, dialog } = await openForm();
    await user.type(within(dialog).getByLabelText("Name"), "  Rent ");
    await user.type(within(dialog).getByLabelText("Amount"), "1500");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Saved!"));
    // Untrimmed: the server action parses the same schema itself.
    expect(save.mock.calls[0]?.[0]).toEqual({
      name: "  Rent ",
      amount: "1500",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("shows server field errors next to their inputs", async () => {
    const save = vi.fn(async () => {
      throw new ActionError("Name taken", { name: ["Name taken"] });
    });
    const { user, dialog } = await openForm(save);
    await user.type(within(dialog).getByLabelText("Name"), "Rent");
    await user.type(within(dialog).getByLabelText("Amount"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert).toHaveTextContent("Name taken");
    expect(within(dialog).getAllByRole("alert")).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeVisible();
  });

  it("shows a form-level error when the server gives no field errors", async () => {
    const save = vi.fn(async () => {
      throw new ActionError("Something went wrong. Please try again.");
    });
    const { user, dialog } = await openForm(save);
    await user.type(within(dialog).getByLabelText("Name"), "Rent");
    await user.type(within(dialog).getByLabelText("Amount"), "10");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByRole("alert")).toHaveTextContent(
      "Something went wrong. Please try again.",
    );
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("clears old errors when reopened", async () => {
    const { user, dialog } = await openForm();
    await user.click(within(dialog).getByRole("button", { name: "Save" }));
    expect(within(dialog).getAllByRole("alert").length).toBeGreaterThan(0);

    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Open" }));
    const reopened = await screen.findByRole("dialog");
    expect(within(reopened).queryByRole("alert")).toBeNull();
  });
});

function TestConfirm({ run }: { run: (id: string) => Promise<void> }) {
  const mutation = useMutation<void, ActionError, string>({ mutationFn: run });
  return (
    <ConfirmAction
      trigger={<button type="button">Delete it</button>}
      title="Delete this?"
      description="It will be removed."
      confirmLabel="Delete"
      successMessage="Deleted"
      mutation={mutation}
      variables="item-1"
    />
  );
}

describe("ConfirmAction", () => {
  async function openConfirm(run: (id: string) => Promise<void>) {
    const user = userEvent.setup();
    renderWithQuery(<TestConfirm run={run} />);
    await user.click(screen.getByRole("button", { name: "Delete it" }));
    const dialog = await screen.findByRole("alertdialog", {
      name: "Delete this?",
    });
    return { user, dialog };
  }

  it("runs the mutation with its variables, then closes", async () => {
    const run = vi.fn(async (_id: string) => {});
    const { user, dialog } = await openConfirm(run);
    expect(within(dialog).getByText("It will be removed.")).toBeVisible();
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() => expect(toast.success).toHaveBeenCalledWith("Deleted"));
    expect(run.mock.calls[0]?.[0]).toBe("item-1");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  });

  it("stays open and reports the error when it fails", async () => {
    const run = vi.fn(async () => {
      throw new ActionError("That item no longer exists.");
    });
    const { user, dialog } = await openConfirm(run);
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("That item no longer exists."),
    );
    expect(screen.getByRole("alertdialog")).toBeVisible();
  });

  it("can be cancelled without running anything", async () => {
    const run = vi.fn(async () => {});
    const { user, dialog } = await openConfirm(run);
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(run).not.toHaveBeenCalled();
  });
});
