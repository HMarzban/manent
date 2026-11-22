// Script settings beside the page, loaded apart: shared with everyone on the script, each change said in the message slot.
import { SCRIPT_GROUPS, SETTINGS, appliesToFormat } from "@manent/settings";
import type { ScriptGroup, SettingKey } from "@manent/settings";
import {
  Button,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DOCUMENT_WORDS,
  LIBRARY_WORDS,
  SettingRow,
  SettingsProvider,
  formatDate,
  useSetting,
  useSettingsStore,
  useSubscribable,
} from "@manent/ui";
import { ChevronRightIcon } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { FrozenRow } from "../../production/frozen-row.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { SCRIPT_SETTINGS_PART } from "./script-settings-part.ts";
import { useOpenDocument } from "./open-document.ts";
import { announcing, nameOf, valueLabel } from "./setting-messages.ts";

const GROUP_WORDS: Readonly<Record<ScriptGroup, string>> = Object.freeze({
  page_setup: DOCUMENT_WORDS.pageSetup,
  mores: DOCUMENT_WORDS.mores,
  scene_numbers: DOCUMENT_WORDS.sceneNumbersGroup,
  revisions: DOCUMENT_WORDS.revisionsGroup,
});

/** Each group of `SCRIPT_GROUPS` that has a row, with its settings in their order. */
const GROUPS: readonly { group: ScriptGroup; keys: readonly SettingKey[] }[] =
  Object.freeze(
    SCRIPT_GROUPS.map((group) => ({
      group,
      keys: SETTINGS.all
        .flatMap((def) =>
          def.surfaces.flatMap((surface) =>
            surface.in === "scriptSettings" && surface.group === group
              ? [{ key: def.key, order: surface.order }]
              : [],
          ),
        )
        .toSorted((a, b) => a.order - b.order)
        .map(({ key }) => key),
    })).filter(({ keys }) => keys.length > 0),
  );

/** Who last set a row's value, when another person did; the Paper row's origin while no one is named. */
function SetBy(props: {
  settingKey: SettingKey;
  doc: DocumentServices;
}): ReactNode {
  const { settingKey, doc } = props;
  const { userId } = useServices();
  const { now } = useEnvironment();
  const store = useSettingsStore();
  useSetting(settingKey);
  const people = useSubscribable(doc.people);
  const { provenance } = store.explain(settingKey);
  const by = provenance?.byUserId ?? null;
  const name = by === userId ? null : nameOf(people, by);
  if (provenance !== null && name !== null) {
    const was = provenance.was ?? SETTINGS.get(settingKey).default;
    return (
      <p className="text-meta text-fg-muted">
        {DOCUMENT_WORDS.setBy(
          name,
          // a bag that does not record when a value arrived dates it to now, while it is shown
          formatDate(provenance.at ?? now()),
          valueLabel(settingKey, was, "row"),
        )}
      </p>
    );
  }
  if (settingKey === "script.paper" && by === null)
    return (
      <p className="text-meta text-fg-muted">
        {DOCUMENT_WORDS.paperFromRegion}
      </p>
    );
  return null;
}

/** The Script scope's own group: open, with its scope line, its groups of rows, and a link to the person's own preferences. */
export function ScriptSettings(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const doc = useOpenDocument(docId);
  const titleSource = useMemo(
    () => services.library.documentTitle(docId),
    [services, docId],
  );
  const title = useSubscribable(titleSource) ?? LIBRARY_WORDS.untitledScript;
  const store = useMemo(
    () => announcing(services.openScriptStore(docId), services),
    [services, docId],
  );
  if (doc === null) return null;
  return (
    <Collapsible
      defaultOpen
      {...{ [SCRIPT_SETTINGS_PART]: "" }}
      className="flex flex-col gap-2"
    >
      {/* a quiet row, its chevron where the rows' words begin */}
      <CollapsibleTrigger className="group/disclosure -mx-2 flex min-h-row items-center gap-1 rounded-control px-1 text-start text-ui font-semibold transition-colors hover:bg-subtle active:bg-control">
        <ChevronRightIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-fg-muted group-data-panel-open/disclosure:rotate-90"
        />
        {DOCUMENT_WORDS.scriptSettingsHeading}
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-2">
        <p className="text-meta text-fg-muted">
          {DOCUMENT_WORDS.scriptScopeLine(title)}
        </p>
        <ReadOnlyLine doc={doc} />
        <SettingsProvider store={store}>
          <Groups doc={doc} docId={docId} />
        </SettingsProvider>
        <Button
          variant="link"
          size="sm"
          className="self-start"
          onClick={() => services.commands.run("app.preferences", "control")}
        >
          {DOCUMENT_WORDS.ownPreferences}
        </Button>
      </CollapsibleContent>
    </Collapsible>
  );
}

/** The groups and their rows that do something in the script's format. */
function Groups(props: { doc: DocumentServices; docId: string }): ReactNode {
  const { doc, docId } = props;
  const format = useSetting("script.format");
  return GROUPS.map(({ group, keys }) => {
    const shown = keys.filter((key) => appliesToFormat(key, format));
    if (shown.length === 0) return null;
    return (
      <section key={group} className="flex flex-col">
        <h3 className="pt-2 text-ui font-semibold">{GROUP_WORDS[group]}</h3>
        {shown.map((key) => (
          <div key={key}>
            <SettingRow settingKey={key} deviceName={null} persisted />
            <SetBy settingKey={key} doc={doc} />
            <FrozenRow settingKey={key} docId={docId} />
          </div>
        ))}
      </section>
    );
  });
}

/** For a person who cannot edit, why every control is read-only. */
function ReadOnlyLine(props: { doc: DocumentServices }): ReactNode {
  if (useSubscribable(props.doc.status).access === "edit") return null;
  return <p className="text-meta">{DOCUMENT_WORDS.readOnlySettings}</p>;
}
