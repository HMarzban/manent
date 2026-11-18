// Set by you: every preference and shortcut that differs from its default, each with its default and Reset, and the two resets.
import type { SettingKey } from "@manent/settings";
import { Button, PREFERENCES_WORDS, SettingRow } from "@manent/ui";
import type { ReactNode } from "react";
import { ShortcutRow, useShortcutViews } from "./keyboard-pane.tsx";
import type { ShortcutChange } from "./keyboard-pane.tsx";

function Group(props: {
  heading: string;
  reset: string;
  onReset(): void;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="flex flex-col">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-micro uppercase text-fg-muted">{props.heading}</h3>
        <Button variant="outline" size="sm" onClick={props.onReset}>
          {props.reset}
        </Button>
      </div>
      {props.children}
    </section>
  );
}

/** `modified` lists the preferences that differ from their defaults, in the order of the panes. */
export function SetByYou(props: {
  modified: readonly SettingKey[];
  deviceName: string | null;
  persisted: boolean;
  onResetPreferences(): void;
  onResetShortcuts(): void;
  onShortcuts(changes: readonly ShortcutChange[]): void;
}): ReactNode {
  const { modified, deviceName, persisted, onShortcuts } = props;
  const shortcuts = useShortcutViews().filter((view) => view.custom !== null);
  if (modified.length === 0 && shortcuts.length === 0)
    return <p className="text-ui">{PREFERENCES_WORDS.allDefault}</p>;
  return (
    <div className="flex flex-col gap-4">
      {modified.length === 0 ? null : (
        <Group
          heading={PREFERENCES_WORDS.preferencesGroup}
          reset={PREFERENCES_WORDS.resetAll}
          onReset={props.onResetPreferences}
        >
          {modified.map((key) => (
            <SettingRow
              key={key}
              settingKey={key}
              deviceName={deviceName}
              persisted={persisted}
            />
          ))}
        </Group>
      )}
      {shortcuts.length === 0 ? null : (
        <Group
          heading={PREFERENCES_WORDS.shortcutsGroup}
          reset={PREFERENCES_WORDS.resetShortcuts}
          onReset={props.onResetShortcuts}
        >
          <ul className="flex flex-col">
            {shortcuts.map((view) => (
              <ShortcutRow
                key={view.id}
                view={view}
                deviceName={deviceName}
                capturing={false}
                onCapture={null}
                onShortcuts={onShortcuts}
              />
            ))}
          </ul>
        </Group>
      )}
    </div>
  );
}
