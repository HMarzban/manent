// Calm Preferences section for restoring Demo and Tour after starting in a clean workspace.
import { Button, PREFERENCES_WORDS } from "@manent/ui";
import type { ReactNode } from "react";
import { restoreDemoMode, useCleanWorkspace } from "../../demo/demo-mode.ts";
import { useEnvironment } from "../../services/context.tsx";
import { SettingsCard } from "../../settings-shell/settings-card.tsx";
import { Group } from "./device-group.tsx";

function RestoreBody(): ReactNode {
  const { desktop } = useEnvironment();
  return (
    <>
      <p className="text-ui text-fg-muted">
        {PREFERENCES_WORDS.demoAndTourOffBody}
      </p>
      <div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => restoreDemoMode(desktop)}
        >
          {PREFERENCES_WORDS.restoreDemoAndTour}
        </Button>
      </div>
    </>
  );
}

/** Shown in Preferences → This browser / This device while Clean workspace mode is on. */
export function DemoRestoreGroup(): ReactNode {
  if (!useCleanWorkspace()) return null;
  return (
    <Group heading={PREFERENCES_WORDS.demoAndTourGroup}>
      <RestoreBody />
    </Group>
  );
}

/** Shown in Preferences → Account while Clean workspace mode is on. */
export function DemoRestoreCard(): ReactNode {
  if (!useCleanWorkspace()) return null;
  return (
    <SettingsCard title={PREFERENCES_WORDS.demoAndTourGroup}>
      <div className="flex flex-col gap-3 px-4 py-3">
        <RestoreBody />
      </div>
    </SettingsCard>
  );
}
