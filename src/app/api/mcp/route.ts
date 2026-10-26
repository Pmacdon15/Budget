import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { verifyMcpToken } from "@/mcp/auth";
import { registerBudgetTools, SERVER_OPTIONS } from "@/mcp/server";

/*
 * The Budget MCP server (Streamable HTTP, stateless). AI apps connect to
 * https://budget.patmac.ca/api/mcp. Every request must carry a Clerk OAuth
 * access token or a personal API key; without one the answer is a 401 whose
 * WWW-Authenticate header points to /.well-known/oauth-protected-resource, which is how
 * an MCP client discovers it should send the user to sign in.
 */
const handler = createMcpHandler(registerBudgetTools, SERVER_OPTIONS);

const authed = withMcpAuth(handler, verifyMcpToken, { required: true });

export { authed as DELETE, authed as GET, authed as POST };
