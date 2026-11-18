// One Preferences pane: its heading, its scope line under it, then its rows.
import { SETTINGS } from "@manent/settings";
import type { SectionId, SettingKey } from "@manent/settings";
import { PREFERENCES_WORDS, SettingRow } from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { AccountPane } from "./account-pane.tsx";
import { DevicePane, FORCED_COLOURS, useMediaQuery } from "./device-pane.tsx";
import { KeyboardPane } from "./keyboard-pane.tsx";
import type { ShortcutChange } from "./keyboard-pane.tsx";

// the rows that carry the note while the system's contrast colours are in use
const THEME_KEYS: ReadonlySet<SettingKey> = new Set([
  "appearance.theme",
  "appearance.whitePage",
]);

/** The preferences a pane shows, in their order there. */
export function paneKeys(pane: SectionId): readonly SettingKey[] {
  return SETTINGS.all
    .flatMap((def) =>
      def.surfaces.flatMap((s) =>
        s.in === "preferences" && s.section === pane
          ? [{ key: def.key, order: s.order }]
          : [],
      ),
    )
    .toSorted((a, b) => a.order - b.order)
    .map((row) => row.key);
}

/** The label of each pane in the pane list, and its heading. */
export function paneLabels(
  shell: "web" | "desktop",
): Readonly<Record<SectionId, string>> {
  return {
    writing: PREFERENCES_WORDS.writing,
    appearance: PREFERENCES_WORDS.appearance,
    keyboard: PREFERENCES_WORDS.keyboard,
    account: PREFERENCES_WORDS.account,
    device: PREFERENCES_WORDS.device(shell === "desktop"),
  };
}

function scopeLine(
  pane: SectionId,
  shell: "web" | "desktop",
  deviceName: string | null,
): string {
  if (pane === "keyboard") return PREFERENCES_WORDS.keyboardLine;
  if (pane === "device")
    return PREFERENCES_WORDS.deviceLine(shell === "desktop", deviceName);
  return PREFERENCES_WORDS.yoursLine;
}

/** The pane's own settings, each a live row; the Theme rows say so while the system's contrast colours are in use. */
export function SettingRows(props: {
  keys: readonly SettingKey[];
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const forced = useMediaQuery(FORCED_COLOURS);
  return props.keys.map((key) => (
    <div key={key}>
      <SettingRow
        settingKey={key}
        deviceName={props.deviceName}
        persisted={props.persisted}
      />
      {forced && THEME_KEYS.has(key) ? (
        <p className="text-meta text-fg-muted">
          {PREFERENCES_WORDS.contrastNote}
        </p>
      ) : null}
    </div>
  ));
}

export function Pane(props: {
  pane: SectionId;
  deviceName: string | null;
  persisted: boolean;
  onShortcuts(changes: readonly ShortcutChange[]): void;
}): ReactNode {
  const { pane, deviceName, persisted } = props;
  const { where } = useEnvironment();
  const headingId = useId();
  const body: Readonly<Record<SectionId, () => ReactNode>> = {
    writing: () => (
      <SettingRows
        keys={paneKeys("writing")}
        deviceName={deviceName}
        persisted={persisted}
      />
    ),
    appearance: () => (
      <SettingRows
        keys={paneKeys("appearance")}
        deviceName={deviceName}
        persisted={persisted}
      />
    ),
    keyboard: () => (
      <KeyboardPane deviceName={deviceName} onShortcuts={props.onShortcuts} />
    ),
    account: () => <AccountPane />,
    device: () => <DevicePane deviceName={deviceName} persisted={persisted} />,
  };
  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-1">
      <h2 id={headingId} className="text-micro uppercase text-fg-muted">
        {paneLabels(where.shell)[pane]}
      </h2>
      <p className="pb-2 text-meta text-fg-muted">
        {scopeLine(pane, where.shell, deviceName)}
      </p>
      {body[pane]()}
    </section>
  );
}
