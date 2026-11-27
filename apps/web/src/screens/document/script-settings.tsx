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
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { DocumentServices } from "../../services/ports.ts";
import { SCRIPT_SETTING_ROWS } from "./script-setting-rows.ts";
import {
  SCRIPT_SETTINGS_PART,
  consumeScriptSettingsOpen,
  hasPendingScriptSettingsOpen,
  subscribeScriptSettingsOpen,
} from "./script-settings-part.ts";
import { useOpenDocument } from "./open-document.ts";
import { announcing, nameOf, valueLabel } from "./setting-messages.ts";

const GROUP_WORDS: Readonly<Record<ScriptGroup, string>> = Object.freeze({
  page_setup: DOCUMENT_WORDS.pageSetup,
  mores: DOCUMENT_WORDS.mores,
  scene_numbers: DOCUMENT_WORDS.sceneNumbersGroup,
  revisions: DOCUMENT_WORDS.revisionsGroup,
  header_footer: DOCUMENT_WORDS.headerFooterGroup,
  layout_engine: DOCUMENT_WORDS.layoutEngineGroup,
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

/** The row drawn for `settingKey`: a feature's own, else the plain setting row. */
function Row(props: { settingKey: SettingKey; docId: string }): ReactNode {
  const { settingKey, docId } = props;
  for (const row of SCRIPT_SETTING_ROWS)
    if (row.kind === "custom" && row.settingKey === settingKey)
      return <row.Row settingKey={settingKey} docId={docId} />;
  return <SettingRow settingKey={settingKey} deviceName={null} persisted />;
}

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

/** Concise summary shown while Script settings is collapsed, e.g. "Screenplay · US Letter". */
function Summary(): ReactNode {
  const format = useSetting("script.format");
  const paper = useSetting("script.paper");
  const formatText = valueLabel("script.format", format, "row");
  const text = appliesToFormat("script.paper", format)
    ? `${formatText} · ${valueLabel("script.paper", paper, "row")}`
    : formatText;
  return <p className="ps-5 text-meta text-fg-muted">{text}</p>;
}

/**
 * The Script scope's own group: collapsed by default with a concise summary so Production, Checks, Numbers and Goal
 * sit above the fold; opens automatically when `doc.scriptSettings` moves focus to it.
 */
export function ScriptSettings(props: { docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const doc = useOpenDocument(docId);
  const [open, setOpen] = useState(hasPendingScriptSettingsOpen);
  useEffect(() => {
    if (consumeScriptSettingsOpen()) setOpen(true);
    return subscribeScriptSettingsOpen(() => setOpen(true));
  }, []);
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
    <SettingsProvider store={store}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        {...{ [SCRIPT_SETTINGS_PART]: "" }}
        className="flex flex-col gap-2"
      >
        {/* a quiet row, its chevron where the rows' words begin */}
        <CollapsibleTrigger className="group/disclosure -mx-2 flex min-h-row items-center gap-1 rounded-control px-1 text-start text-ui font-semibold transition-colors hover:bg-subtle active:bg-control">
          <ChevronRightIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-fg-muted duration-(--dur-fast) ease-out group-hover/disclosure:text-fg group-data-panel-open/disclosure:rotate-90 motion-safe:transition-transform"
          />
          {DOCUMENT_WORDS.scriptSettingsHeading}
        </CollapsibleTrigger>
        {open ? null : <Summary />}
        <CollapsibleContent className="flex animate-in flex-col gap-2 duration-(--dur-fast) ease-out fade-in-0">
          <p className="text-meta text-fg-muted">
            {DOCUMENT_WORDS.scriptScopeLine(title)}
          </p>
          <ReadOnlyLine doc={doc} />
          <Groups doc={doc} docId={docId} />
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
    </SettingsProvider>
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
      <section
        key={group}
        className="flex flex-col border-t border-line pt-3 first:border-t-0 first:pt-0"
      >
        <h3 className="pb-1 text-ui font-semibold">{GROUP_WORDS[group]}</h3>
        {shown.map((key) => (
          <div key={key}>
            <Row settingKey={key} docId={docId} />
            <SetBy settingKey={key} doc={doc} />
            {SCRIPT_SETTING_ROWS.map((row) =>
              row.kind === "state" ? (
                <row.State key={row.id} settingKey={key} docId={docId} />
              ) : null,
            )}
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
