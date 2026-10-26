import { generateClerkProtectedResourceMetadata } from "@clerk/mcp-tools/server";
import {
  getPublicOrigin,
  metadataCorsOptionsRequestHandler,
} from "mcp-handler";

/*
 * OAuth Protected Resource Metadata (RFC 9728) for the MCP server: tells an
 * MCP client that /api/mcp is protected by this app's Clerk instance, where
 * the user signs in. Served at /.well-known/oauth-protected-resource and at
 * /.well-known/oauth-protected-resource/api/mcp, the two places clients look.
 */
export function GET(req: Request) {
  const publishableKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!publishableKey) {
    return Response.json(
      { error: "Sign-in isn't configured for this deployment." },
      { status: 503 },
    );
  }
  const metadata = generateClerkProtectedResourceMetadata({
    publishableKey,
    resourceUrl: `${getPublicOrigin(req)}/api/mcp`,
    properties: {
      resource_name: "Budget",
      resource_documentation: "https://budget.patmac.ca/review",
    },
  });
  return Response.json(metadata, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Cache-Control": "max-age=3600",
    },
  });
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
