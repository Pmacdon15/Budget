import { createMcpHandler } from "mcp-handler";
import { verifyMcpToken } from "@/mcp/auth";
import { mcpRoute } from "@/mcp/http";
import { registerBudgetTools, SERVER_OPTIONS } from "@/mcp/server";

/*
 * The Budget MCP server (Streamable HTTP, stateless). AI apps connect to
 * https://budget.patmac.ca/api/mcp. Every request must carry a Clerk OAuth
 * access token or a personal API key; without one the answer is a 401 whose
 * WWW-Authenticate header points to
 * /.well-known/oauth-protected-resource/api/mcp, which is how an MCP client
 * discovers it should send the user to sign in. See src/mcp/http.ts for the
 * HTTP details every client relies on (CORS, bearer parsing, JSON answers).
 */
const handler = createMcpHandler(registerBudgetTools, SERVER_OPTIONS);

const route = mcpRoute(handler, verifyMcpToken);

export { route as DELETE, route as GET, route as OPTIONS, route as POST };
