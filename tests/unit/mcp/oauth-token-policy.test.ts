import { describe, expect, it, vi } from "vitest";
import {
  acceptedAudiences,
  allowedOAuthClientIds,
  audienceList,
  oauthTokenRejection,
  type VerifiedOAuthToken,
} from "@/mcp/oauth-token-policy";

const req = (url = "https://budget.patmac.ca/api/mcp") => new Request(url);

const token = (fields: Partial<VerifiedOAuthToken> = {}) => ({
  userId: "user_a",
  clientId: "client_a",
  scopes: [],
  audiences: [],
  ...fields,
});

describe("allowedOAuthClientIds", () => {
  it("is null when MCP_OAUTH_CLIENT_IDS is unset or blank", () => {
    expect(allowedOAuthClientIds(undefined)).toBeNull();
    expect(allowedOAuthClientIds("")).toBeNull();
    expect(allowedOAuthClientIds(" , ")).toBeNull();
  });

  it("splits a comma-separated list and trims it", () => {
    expect(allowedOAuthClientIds(" a ,b,, c")).toEqual(
      new Set(["a", "b", "c"]),
    );
  });
});

describe("audienceList", () => {
  it("normalizes a JWT aud claim to a list of strings", () => {
    expect(audienceList(undefined)).toEqual([]);
    expect(audienceList("x")).toEqual(["x"]);
    expect(audienceList(["x", "", 3, "y"])).toEqual(["x", "y"]);
  });
});

describe("acceptedAudiences", () => {
  it("is the production resource in production, whatever host was used", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", "budget.patmac.ca");
    expect(
      acceptedAudiences(req("https://budget-abc123.vercel.app/api/mcp")),
    ).toEqual(["https://budget.patmac.ca/api/mcp", "https://budget.patmac.ca"]);
  });
});

describe("oauthTokenRejection", () => {
  it("accepts a token without an audience, or whose only audience is its client", () => {
    expect(oauthTokenRejection(token(), req(), null)).toBeNull();
    expect(
      oauthTokenRejection(token({ audiences: ["client_a"] }), req(), null),
    ).toBeNull();
  });

  it("accepts a token issued for this MCP server", () => {
    for (const aud of [
      "https://budget.patmac.ca/api/mcp",
      "https://budget.patmac.ca/api/mcp/",
      "https://budget.patmac.ca",
    ]) {
      expect(
        oauthTokenRejection(token({ audiences: [aud] }), req(), null),
      ).toBeNull();
    }
  });

  it("refuses a token issued for another resource", () => {
    for (const aud of [
      "https://other.example/api/mcp",
      "https://budget.patmac.ca.evil.example/api/mcp",
      "https://budget.patmac.ca/api/other",
      "client_b",
    ]) {
      expect(
        oauthTokenRejection(token({ audiences: [aud] }), req(), null),
      ).toContain("audience");
    }
  });

  it("refuses a production-bound token on a preview, and the other way round", () => {
    expect(
      oauthTokenRejection(
        token({ audiences: ["https://budget.patmac.ca/api/mcp"] }),
        req("https://budget-git-branch.vercel.app/api/mcp"),
        null,
      ),
    ).toContain("audience");
  });

  it("refuses a client that isn't on the allowlist, when there is one", () => {
    const allowed = new Set(["client_a"]);
    expect(oauthTokenRejection(token(), req(), allowed)).toBeNull();
    expect(
      oauthTokenRejection(token({ clientId: "client_b" }), req(), allowed),
    ).toContain("MCP_OAUTH_CLIENT_IDS");
  });

  it("reads the allowlist from MCP_OAUTH_CLIENT_IDS by default", () => {
    vi.stubEnv("MCP_OAUTH_CLIENT_IDS", "client_b");
    expect(oauthTokenRejection(token(), req())).toContain(
      "MCP_OAUTH_CLIENT_IDS",
    );
  });
});
