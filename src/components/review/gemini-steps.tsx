import { configuredIssuer, MCP_SCOPES } from "@/mcp/oauth-config";
import { CopyButton } from "./copy-button";

/**
 * How to add Budget to Gemini (gemini.google.com and the Gemini mobile app).
 * Gemini registers itself with Budget's sign-in, so the URL is all most people
 * need. The authorization and token URLs are public (they're in Clerk's
 * discovery document) and come from the configured Clerk instance; no client
 * secret is ever shown here.
 */
export function GeminiSteps() {
  const issuer = configuredIssuer();
  const fields = issuer
    ? [
        { label: "Authorization URL", value: `${issuer}/oauth/authorize` },
        { label: "Token URL", value: `${issuer}/oauth/token` },
        { label: "Scopes", value: MCP_SCOPES.join(" ") },
      ]
    : [];

  return (
    <details className="group rounded-md border px-3 py-2">
      <summary className="cursor-pointer font-medium">Using Gemini?</summary>
      <div className="grid gap-3 pt-2 text-muted-foreground">
        <ol className="grid list-decimal gap-1 pl-5">
          <li>
            On gemini.google.com, open <strong>Settings</strong> →{" "}
            <strong>Connected Apps</strong> (under{" "}
            <strong>Personal Intelligence</strong> if you don't see it), then{" "}
            <strong>Add a custom app</strong>.
          </li>
          <li>
            Paste the URL above. Leave <strong>Advanced features</strong> empty:
            Gemini registers itself with Budget's sign-in.
          </li>
          <li>
            Accept Google's notice, choose <strong>Link account</strong>, sign
            in with your Budget account and select <strong>Allow</strong>.
          </li>
          <li>
            In a chat, type <strong>@</strong> and pick Budget. It also works in
            the Gemini phone app.
          </li>
        </ol>
        {fields.length > 0 ? (
          <div className="grid gap-2">
            <p>
              If Gemini asks for a Client ID and secret anyway, enter the ones
              the Budget owner gives you, plus:
            </p>
            <dl className="grid gap-2">
              {fields.map((field) => (
                <div key={field.label} className="grid gap-1">
                  <dt className="text-xs">{field.label}</dt>
                  <dd className="flex items-center gap-2">
                    <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1 text-xs">
                      {field.value}
                    </code>
                    <CopyButton
                      value={field.value}
                      label={`Copy ${field.label}`}
                    />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
        <p className="text-xs">
          Gemini's custom apps need a personal Google account with Keep Activity
          on. If linking fails with "Account linking is required", remove the
          app in Gemini and add it again.
        </p>
      </div>
    </details>
  );
}
