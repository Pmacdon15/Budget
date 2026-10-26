import {
  authServerMetadataHandlerClerk,
  metadataCorsOptionsRequestHandler,
} from "@clerk/mcp-tools/next";

/*
 * OAuth Authorization Server Metadata (RFC 8414), copied from this app's Clerk
 * instance. Current MCP clients find Clerk through the protected resource
 * metadata instead; older ones look for this document on the MCP server's own
 * domain.
 */
export const GET = authServerMetadataHandlerClerk();

export const OPTIONS = metadataCorsOptionsRequestHandler();
