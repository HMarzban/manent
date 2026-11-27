// Compact Install section in Preferences -> This browser, shown only on the web when an install path exists.
import { Button, PREFERENCES_WORDS } from "@manent/ui";
import { useCallback, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import type { InstallHint } from "../../platform.ts";
import { browserInstallStore } from "../../pwa/install.ts";
import { Group } from "./device-group.tsx";

/** Compact Install section, shown only on the web when not already standalone and an install path exists. */
export function InstallGroup(props: {
  standalone: boolean;
  hint: InstallHint;
}): ReactNode {
  const store = browserInstallStore();
  const canInstall = useSyncExternalStore(
    useCallback((listener: () => void) => store.subscribe(listener), [store]),
    () => store.canInstall(),
  );
  if (props.standalone) return null;
  if (!canInstall && props.hint === "none") return null;
  return (
    <Group heading={PREFERENCES_WORDS.installGroup}>
      {canInstall ? (
        <>
          <p className="text-ui">{PREFERENCES_WORDS.installChromium}</p>
          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void store.promptInstall()}
            >
              {PREFERENCES_WORDS.installManent}
            </Button>
          </div>
        </>
      ) : props.hint === "macos_safari" ? (
        <p className="text-ui">{PREFERENCES_WORDS.installMacSafari}</p>
      ) : (
        <p className="text-ui">{PREFERENCES_WORDS.installIosSafari}</p>
      )}
    </Group>
  );
}
