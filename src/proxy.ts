import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/welcome",
]);
const isHome = createRouteMatcher(["/"]);

export default clerkMiddleware(async (auth, req) => {
  if (isHome(req)) {
    // Signed in: "/" is the overview, exactly as before.
    // Signed out: show the public homepage at "/" instead of bouncing to sign-in.
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.rewrite(new URL("/welcome", req.url));
    }
    return;
  }
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
