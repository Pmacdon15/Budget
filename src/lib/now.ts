import "server-only";
import { connection } from "next/server";
import { currentMonth, today } from "@/lib/month";

/*
 * "Now" for server components and the DAL. With partial prefetching, Next.js
 * also prerenders pages past `auth()` and `searchParams` (the runtime
 * prefetch), and reading the clock there is an error
 * (https://nextjs.org/docs/messages/blocking-prerender-current-time). These
 * wait for the real request first. Client code, route handlers and the MCP
 * tools can keep calling `currentMonth()` / `today()` directly.
 */

/** This month, "YYYY-MM", in America/Regina time. */
export async function requestMonth() {
  await connection();
  return currentMonth();
}

/** Today, "YYYY-MM-DD", in America/Regina time. */
export async function requestToday() {
  await connection();
  return today();
}
