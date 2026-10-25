import { Repeat } from "lucide-react";
import { RolloverDialog } from "@/components/rollover/rollover-dialog";
import { Button } from "@/components/ui/button";
import { getCategoryLimits } from "@/dal/category-budgets";
import { getRolloverAmounts, getRolloverSettings } from "@/dal/rollover";

/**
 * Opens the rollover settings. Waits for the month first, then the session;
 * renders nothing until the user has at least one budget to roll over.
 */
export async function RolloverButton({
  month: monthPromise,
}: {
  month: Promise<string>;
}) {
  const month = await monthPromise;
  const [limits, settings, amounts] = await Promise.all([
    getCategoryLimits(month),
    getRolloverSettings(month),
    getRolloverAmounts(month),
  ]);
  if (limits.length === 0) return null;

  return (
    <RolloverDialog
      month={month}
      settings={settings}
      limits={limits}
      amounts={amounts}
      trigger={
        <Button variant="ghost" size="sm">
          <Repeat /> {settings.enabled ? "Rollover on" : "Rollover"}
        </Button>
      }
    />
  );
}
