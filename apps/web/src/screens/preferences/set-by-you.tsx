// Set by you: every preference and shortcut that differs from its default, each with its default and Reset, and the two resets.
import type { SettingKey } from "@manent/settings";
import { Button, PREFERENCES_WORDS, SettingRow } from "@manent/ui";
import type { ReactNode } from "react";
import {
  ShortcutRow,
  ShortcutTable,
  useShortcutViews,
} from "./keyboard-pane.tsx";
import type { ShortcutChange } from "./keyboard-pane.tsx";

function Group(props: {
  heading: string;
  reset: string;
  onReset(): void;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-end justify-between gap-4">
        <h3 className="mn-group-label px-0!">{props.heading}</h3>
        <Button variant="outline" onClick={props.onReset}>
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
    <div className="flex flex-col gap-8">
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
          <ShortcutTable heading={null}>
            {shortcuts.map((view, index) => (
              <ShortcutRow
                key={view.id}
                view={view}
                place={{ index, count: shortcuts.length }}
                deviceName={deviceName}
                capturing={false}
                onCapture={null}
                onShortcuts={onShortcuts}
              />
            ))}
          </ShortcutTable>
        </Group>
      )}
    </div>
  );
}
