import "server-only";
import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { UnauthorizedError } from "@/dal/errors";

/**
 * For pages and route handlers: sends signed-out visitors to sign-in.
 * Deduplicated per request, since every streamed hole on a page asks for it.
 */
export const requireUserId = cache(async () => {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");
  return userId;
});

/** For mutations: throws instead of redirecting so the action can report it. */
export async function currentUserIdOrThrow() {
  const { userId } = await auth();
  if (!userId) throw new UnauthorizedError();
  return userId;
}
