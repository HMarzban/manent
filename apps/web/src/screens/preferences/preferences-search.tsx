// Search results, which replace the pane: the matching preferences as live rows, an answer's sentence, or what lives elsewhere.
import { COMMANDS } from "@manent/commands";
import { SETTINGS } from "@manent/settings";
import type { SearchPointer } from "@manent/settings";
import {
  Button,
  CommandButton,
  Kbd,
  PREFERENCES_WORDS,
  keyLabel,
  useCommandState,
  useCommands,
} from "@manent/ui";
import type { ReactNode } from "react";
import { useEnvironment } from "../../services/context.tsx";
import { SettingRows } from "./pane.tsx";
import { isCommandId, searchPreferences } from "./search-index.ts";
import type { SearchResult } from "./search-index.ts";

const saysOf = (pointer: SearchPointer, shell: "web" | "desktop"): string =>
  typeof pointer.says === "string" ? pointer.says : pointer.says[shell];

/** A pointer to where a thing lives; it opens that place while its command can run, and is only words otherwise. */
function PointerRow(props: { pointer: SearchPointer }): ReactNode {
  const { pointer } = props;
  const { service } = useCommands();
  const { where } = useEnvironment();
  const opens =
    pointer.opens !== null && isCommandId(pointer.opens) ? pointer.opens : null;
  const state = opens === null ? null : service.state(opens);
  const words = (
    <>
      <span>{pointer.label}</span>
      <span className="text-fg-muted">{saysOf(pointer, where.shell)}</span>
    </>
  );
  if (opens === null || state === null || !state.enabled || !state.visible)
    return <p className="flex flex-wrap gap-4 text-ui">{words}</p>;
  return (
    <Button
      variant="ghost"
      className="justify-start gap-4 text-ui"
      onClick={() => service.run(opens, "control")}
    >
      {words}
      {" ›"}
    </Button>
  );
}

function keyOf(result: SearchResult): string {
  switch (result.kind) {
    case "preference":
      return result.key;
    case "command":
      return result.id;
    case "pointer":
      return result.pointer.label;
  }
}

/** A preference is its live row; a command is its button. */
function ResultRow(props: {
  result: SearchResult;
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { result, deviceName, persisted } = props;
  switch (result.kind) {
    case "preference":
      return (
        <SettingRows
          keys={[result.key]}
          deviceName={deviceName}
          persisted={persisted}
        />
      );
    case "command":
      return <CommandButton id={result.id} />;
    case "pointer":
      return <PointerRow pointer={result.pointer} />;
  }
}

/** Opens the palette, which searches every command; it shows the palette's own keys. */
function SearchAllCommands(props: { query: string }): ReactNode {
  const { service, platform } = useCommands();
  const [chord] = useCommandState("app.palette").keys;
  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        className="justify-start text-ui"
        onClick={() => service.run("app.palette", "control")}
      >
        {PREFERENCES_WORDS.searchAllCommands(props.query)}
      </Button>
      {chord === undefined ? null : <Kbd>{keyLabel(chord, platform)}</Kbd>}
    </div>
  );
}

/** What `query` finds; a search never ends in nothing, since the palette is always offered when no preference matches. */
export function PreferencesSearch(props: {
  query: string;
  deviceName: string | null;
  persisted: boolean;
}): ReactNode {
  const { query, deviceName, persisted } = props;
  const { where } = useEnvironment();
  const found = searchPreferences(query, {
    registry: SETTINGS,
    commands: COMMANDS,
  });
  const rows = (results: readonly SearchResult[]): ReactNode =>
    results.map((result) => (
      <ResultRow
        key={keyOf(result)}
        result={result}
        deviceName={deviceName}
        persisted={persisted}
      />
    ));
  if (found.preferences.length > 0)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-meta text-fg-muted tabular-nums">
          {PREFERENCES_WORDS.resultsCount(found.preferences.length)}
        </p>
        {rows(
          found.preferences.map((key): SearchResult => ({
            kind: "preference",
            key,
          })),
        )}
      </div>
    );
  if (found.answers.length > 0)
    return (
      <div className="flex flex-col gap-2">
        {found.answers.map((answer) => (
          <p key={answer.label} className="text-ui">
            {saysOf(answer, where.shell)}
          </p>
        ))}
      </div>
    );
  return (
    <div className="flex flex-col gap-1">
      <p className="text-ui">{PREFERENCES_WORDS.noMatch(query.trim())}</p>
      <h3 className="mn-group-label px-0!">{PREFERENCES_WORDS.elsewhere}</h3>
      {rows([
        ...found.elsewhere.map((pointer): SearchResult => ({
          kind: "pointer",
          pointer,
        })),
        ...found.commands.map((id): SearchResult => ({ kind: "command", id })),
      ])}
      <SearchAllCommands query={query.trim()} />
    </div>
  );
}
