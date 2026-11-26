// Preferences → Keyboard: every command with its keys, grouped by menu, the keys that are fixed and why, and the shortcut editor.
import type { Keys } from "@manent/commands";
import { MENU_IDS } from "@manent/settings";
import type { MenuId } from "@manent/settings";
import {
  Button,
  Kbd,
  MENU_WORDS,
  PREFERENCES_WORDS,
  Row,
  formatDate,
  keyLabel,
  useCommands,
  useSubscribable,
} from "@manent/ui";
import { useRef, useState } from "react";
import type { ReactNode } from "react";
import type { Where } from "../../platform.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { FixedKey } from "../../services/ports.ts";
import { FindByKeys, ShortcutCapture } from "./shortcut-capture.tsx";
import {
  readCustomShortcuts,
  useCustomShortcuts,
  useShortcutViews,
} from "./shortcut-views.ts";
import type {
  CustomShortcut,
  ShortcutChange,
  ShortcutView,
} from "./shortcut-views.ts";

export { readCustomShortcuts, useCustomShortcuts, useShortcutViews };
export type { ShortcutChange };

// the title and person menus are named by the document's title and the person's initials: their commands have no heading
const MENU_LABELS: Readonly<Record<MenuId, string | null>> = Object.freeze({
  app: MENU_WORDS.app,
  file: MENU_WORDS.file,
  edit: MENU_WORDS.edit,
  view: MENU_WORDS.view,
  format: MENU_WORDS.format,
  script: MENU_WORDS.script,
  production: MENU_WORDS.production,
  window: MENU_WORDS.window,
  help: MENU_WORDS.help,
  title: null,
  person: null,
});
const FIXED_WORDS: Readonly<Record<FixedKey["reason"], string>> = Object.freeze(
  { flow: PREFERENCES_WORDS.fixedFlow, picker: PREFERENCES_WORDS.fixedPicker },
);

function KeysText(props: { keys: Keys; editable?: boolean }): ReactNode {
  const { platform } = useCommands();
  if (props.keys.length === 0)
    return (
      <span
        className={
          props.editable
            ? "text-fg-muted group-hover/shortcut:text-fg group-hover/shortcut:underline"
            : undefined
        }
      >
        {PREFERENCES_WORDS.noShortcut}
      </span>
    );
  return (
    <span className="inline-flex gap-1">
      {props.keys.map((chord) => (
        <Kbd key={chord}>{keyLabel(chord, platform)}</Kbd>
      ))}
    </span>
  );
}

/** "Set by you 12 Nov · Default: ⌘⇧A", naming the device it was set on when that is not this one. */
function setByYouLine(
  custom: CustomShortcut,
  defaults: Keys,
  where: Where,
  deviceName: string | null,
): string {
  const defaultLabel =
    defaults.length === 0
      ? PREFERENCES_WORDS.noShortcut
      : defaults.map((chord) => keyLabel(chord, where.platform)).join(" · ");
  const from = custom.on === "" || custom.on === deviceName ? null : custom.on;
  return PREFERENCES_WORDS.setByYou(formatDate(custom.at), defaultLabel, from);
}

/**
 * One command's row. With `onCapture` the row opens the shortcut editor when activated, and `onShortcuts` keeps what
 * it records; without it the row only shows the keys and resets them. `posinset` counts from 1 within `setsize` rows.
 */
export function ShortcutRow({
  view,
  posinset,
  setsize,
  deviceName,
  capturing,
  onCapture,
  onShortcuts,
}: {
  view: ShortcutView;
  posinset: number;
  setsize: number;
  deviceName: string | null;
  capturing: boolean;
  onCapture: ((open: boolean) => void) | null;
  onShortcuts(changes: readonly ShortcutChange[]): void;
}): ReactNode {
  const { where } = useEnvironment();
  const row = useRef<HTMLElement>(null);
  const editable = view.fixed === null && onCapture !== null;
  const close = (): void => {
    onCapture?.(false);
    row.current?.focus();
  };
  return (
    <li
      aria-posinset={posinset}
      aria-setsize={setsize}
      className="group/shortcut flex flex-col"
    >
      <Row
        rowRef={row}
        meta={view.fixed ?? undefined}
        trailing={[
          <KeysText key="keys" keys={view.keys} editable={editable} />,
        ]}
        onActivate={editable ? () => onCapture(true) : undefined}
      >
        {view.label}
      </Row>
      {view.custom === null && view.notes.length === 0 ? null : (
        <div className="flex flex-col gap-1 px-3 pb-2 text-meta text-fg-muted">
          {view.custom === null ? null : (
            <p className="flex flex-wrap items-center gap-2">
              {setByYouLine(view.custom, view.defaults, where, deviceName)}
              <Button
                variant="link"
                className="h-auto p-0"
                onClick={() =>
                  onShortcuts([{ commandId: view.id, keys: null }])
                }
              >
                {PREFERENCES_WORDS.reset}
              </Button>
            </p>
          )}
          {view.notes.map((note) => (
            <p key={note}>{note}</p>
          ))}
        </div>
      )}
      {capturing ? (
        <ShortcutCapture
          commandId={view.id}
          label={view.label}
          onKeys={(keys) => {
            onShortcuts([{ commandId: view.id, keys }]);
            close();
          }}
          onClose={close}
        />
      ) : null}
    </li>
  );
}

/** A table card of rows under `heading`, or with no head row when the rows have no heading. */
export function ShortcutTable(props: {
  heading: string | null;
  children: ReactNode;
}): ReactNode {
  return (
    <section className="mn-table flex flex-col">
      {props.heading === null ? null : (
        <h3 className="mn-table-head flex items-center px-3">
          {props.heading}
        </h3>
      )}
      <ul className="flex flex-col">{props.children}</ul>
    </section>
  );
}

function FixedRow({
  fixed,
  posinset,
  setsize,
}: {
  fixed: FixedKey;
  posinset: number;
  setsize: number;
}): ReactNode {
  const { where } = useEnvironment();
  return (
    <li aria-posinset={posinset} aria-setsize={setsize}>
      <Row meta={FIXED_WORDS[fixed.reason]}>
        {keyLabel(fixed.chord, where.platform)}
      </Row>
    </li>
  );
}

/** Rows set by you and rows that may not work here first, each kind in its own order. */
const byAttention = (views: readonly ShortcutView[]): ShortcutView[] => [
  ...views.filter((v) => v.custom !== null || v.mayNotWork),
  ...views.filter((v) => v.custom === null && !v.mayNotWork),
];

/** `onShortcuts` keeps each change the shortcut editor or a Reset makes. */
export function KeyboardPane(props: {
  deviceName: string | null;
  onShortcuts(changes: readonly ShortcutChange[]): void;
}): ReactNode {
  const { deviceName, onShortcuts } = props;
  const views = useShortcutViews();
  const fixedKeys = useSubscribable(useServices().fixedKeys);
  const [capturing, setCapturing] = useState<string | null>(null);
  const groups = MENU_IDS.map((menu) => ({
    menu,
    label: MENU_LABELS[menu],
    views: byAttention(views.filter((view) => view.group === menu)),
  })).filter((group) => group.views.length > 0);
  return (
    <>
      <FindByKeys />
      <div
        role="group"
        aria-label={PREFERENCES_WORDS.shortcutsGroup}
        className="flex flex-col gap-4"
      >
        {groups.map((group) => (
          <ShortcutTable key={group.menu} heading={group.label}>
            {group.views.map((view, index) => (
              <ShortcutRow
                key={view.id}
                view={view}
                posinset={index + 1}
                setsize={group.views.length}
                deviceName={deviceName}
                capturing={capturing === view.id}
                onCapture={(open) => setCapturing(open ? view.id : null)}
                onShortcuts={onShortcuts}
              />
            ))}
          </ShortcutTable>
        ))}
        {fixedKeys.length === 0 ? null : (
          <ShortcutTable heading={PREFERENCES_WORDS.writing}>
            {fixedKeys.map((fixed, index) => (
              <FixedRow
                key={fixed.chord}
                fixed={fixed}
                posinset={index + 1}
                setsize={fixedKeys.length}
              />
            ))}
          </ShortcutTable>
        )}
      </div>
    </>
  );
}
