import { Bot } from "lucide-react";
import { Suspense } from "react";
import { ListSkeleton } from "@/components/skeletons";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getApiKeys } from "@/dal/api-keys";
import { CopyButton } from "./copy-button";
import { CreateKeyDialog } from "./create-key-dialog";
import { RevokeKeyButton } from "./revoke-key-button";

export const MCP_URL = "https://budget.patmac.ca/api/mcp";

const dateLabel = new Intl.DateTimeFormat("en-CA", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "America/Regina",
});

/**
 * How to connect an AI assistant. The URL and steps are in the static shell;
 * the user's API keys stream in once the URL (`month`) is known.
 */
export function ConnectAiCard({ month }: { month: Promise<string> }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="size-4" /> Connect your AI
        </CardTitle>
        <CardDescription>
          Add Budget to Claude, Muse, Gemini or any app that supports MCP
          connectors, then ask it to go through your email for bills and
          receipts.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4 text-sm">
        <div className="flex items-center gap-2">
          <code className="min-w-0 flex-1 truncate rounded-md bg-muted px-2 py-1.5 text-xs">
            {MCP_URL}
          </code>
          <CopyButton value={MCP_URL} label="Copy connector URL" />
        </div>
        <ol className="grid list-decimal gap-1 pl-5 text-muted-foreground">
          <li>In your AI app, add a custom connector with this URL.</li>
          <li>Sign in with your Budget account when it asks.</li>
          <li>
            Whatever it finds lands here for you to approve before it counts.
          </li>
        </ol>
        {/* <GeminiSteps /> */}
        <div className="grid gap-2 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-muted-foreground">
              App can't sign in? Use an API key instead.
            </p>
            <CreateKeyDialog />
          </div>
          <Suspense fallback={<ListSkeleton rows={1} />}>
            <KeyList month={month} />
          </Suspense>
        </div>
      </CardContent>
    </Card>
  );
}

async function KeyList({ month }: { month: Promise<string> }) {
  await month;
  const keys = await getApiKeys();
  if (keys.length === 0) return null;
  return (
    <ul className="grid gap-1">
      {keys.map((key) => (
        <li
          key={key.id}
          className="flex items-center justify-between gap-2 rounded-md border px-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{key.name}</p>
            <p className="text-muted-foreground text-xs">
              <code>{key.prefix}…</code> · created{" "}
              {dateLabel.format(new Date(key.createdAt))}
              {key.lastUsedAt
                ? ` · last used ${dateLabel.format(new Date(key.lastUsedAt))}`
                : " · never used"}
            </p>
          </div>
          <RevokeKeyButton apiKey={key} />
        </li>
      ))}
    </ul>
  );
}
