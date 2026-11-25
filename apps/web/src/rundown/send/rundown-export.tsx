// The Send screen's Export body for a rundown: What (Rows and Columns), As (six file types), Checks, preview tiles and counted export.
import {
  RUNDOWN_SEND_WORDS,
  formatDuration,
  formatPosition,
  formatTime,
} from "@manent/ui";
import type { Message } from "@manent/ui";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SendFormProps } from "../../screens/send/forms.ts";
import { SendFrame } from "../../screens/send/send-frame.tsx";
import type { SendRow } from "../../screens/send/send-frame.tsx";
import { typesOffered } from "../../send/file-types.ts";
import { save } from "../../send/script-file.ts";
import type { ExportFileType, WrittenFile } from "../../send/script-file.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import {
  buildRundownForExport,
  collectMissingRows,
  collectOutsideFontSentence,
  filterRundownRows,
  formatAirDateFile,
  formatAirDateFull,
  includedStoryIds,
  maxRowNumberOf,
  summaryLineOf,
} from "./rundown-export-model.ts";
import {
  STORY_HOLDING_FILE_TYPES,
  isRundownFileTypeId,
} from "./rundown-file-work.ts";
import type {
  RundownFileTypeId,
  RundownFileWork,
} from "./rundown-file-work.ts";
import { writeRundownFile } from "./rundown-files.ts";
import { RundownPreviewTiles } from "./rundown-preview-tiles.tsx";
import type { StoryPageRef } from "./rundown-preview-tiles.tsx";
import {
  CheckOption,
  RundownWhatContent,
  buildRundownChecksRow,
  useRundownWhatState,
} from "./rundown-send-parts.tsx";
import { useRundownSend } from "./use-rundown-send.ts";

const RUNDOWN_OFFERED_TO = Object.freeze({
  docKind: "rundown" as const,
  format: "variety" as const,
  locked: false,
});

function useInitialTypes(
  offered: readonly ExportFileType[],
): RundownFileTypeId[] {
  const searchStr = useRouterState({
    select: (state): string => state.location.searchStr,
  });
  const asked = new URLSearchParams(searchStr).get("as");
  if (
    asked !== null &&
    isRundownFileTypeId(asked) &&
    offered.some((entry) => entry.id === asked)
  )
    return [asked];
  return ["rundown_pdf"];
}

function exportedMessage(title: string): Message {
  return {
    id: "exported",
    text: RUNDOWN_SEND_WORDS.exported(title),
    actions: [],
    lifetime: "brief",
    ownWork: false,
  };
}

function waitNextFrame(
  frame: (fn: () => void) => () => void,
  signal: AbortSignal,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const cancel = frame(resolve);
    signal.addEventListener(
      "abort",
      () => {
        cancel();
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** Export form body for a rundown document on the Send screen. */
export function RundownExport(props: SendFormProps): ReactNode {
  const { docId } = props;
  const { messages, history } = useServices();
  const { frame, now } = useEnvironment();
  const state = useRundownSend(docId);

  const offeredTypes = useMemo(
    () => typesOffered("export", RUNDOWN_OFFERED_TO),
    [],
  );
  const initialTypes = useInitialTypes(offeredTypes);
  const [ticked, setTicked] = useState<readonly RundownFileTypeId[]>(
    () => initialTypes,
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const left = useRef(new AbortController());
  useEffect(() => {
    const controller = new AbortController();
    left.current = controller;
    return () => controller.abort();
  }, []);

  const maxRowNumber = maxRowNumberOf(state.clock);
  const what = useRundownWhatState(
    state.allColumns,
    state.defaultHiddenColumns,
    maxRowNumber,
  );
  const rangeInvalid =
    what.rowMode === "range" &&
    (what.rangeValidation === null || !what.rangeValidation.ok);

  const filteredRows = useMemo(() => {
    if (state.rundown === null || state.clock === null || rangeInvalid)
      return [];
    return filterRundownRows(state.rundown.rows, state.clock, what.activeRange);
  }, [state.rundown, state.clock, rangeInvalid, what.activeRange]);

  const rundownForExport = useMemo(() => {
    if (state.rundown === null || state.clock === null || rangeInvalid)
      return null;
    return buildRundownForExport({
      title: state.projectTitle,
      rundown: state.rundown,
      clock: state.clock,
      rows: filteredRows,
      allColumns: state.allColumns,
      titleColumn: state.titleColumn,
      stories: state.stories,
      missingDocIds: state.missingDocIds,
    });
  }, [
    state.projectTitle,
    state.rundown,
    state.clock,
    rangeInvalid,
    filteredRows,
    state.allColumns,
    state.titleColumn,
    state.stories,
    state.missingDocIds,
  ]);

  const dateLabelFull =
    state.rundown === null
      ? ""
      : formatAirDateFull(state.rundown.rundown.airDate);
  const airDateFileLabel =
    state.rundown === null
      ? ""
      : formatAirDateFile(state.rundown.rundown.airDate);
  const summaryLine =
    state.rundown === null || state.clock === null
      ? null
      : summaryLineOf(state.rundown, state.clock);

  const missingRows = useMemo(
    () =>
      state.clock === null || rangeInvalid
        ? []
        : collectMissingRows(filteredRows, state.clock, state.missingDocIds),
    [filteredRows, state.clock, rangeInvalid, state.missingDocIds],
  );

  const outsideFont = useMemo(
    () =>
      rundownForExport === null || state.loadingStories
        ? null
        : collectOutsideFontSentence(
            rundownForExport,
            dateLabelFull,
            summaryLine,
          ),
    [rundownForExport, state.loadingStories, dateLabelFull, summaryLine],
  );

  const tickedSet = useMemo(() => new Set(ticked), [ticked]);
  const orderedTicked = useMemo(
    () =>
      offeredTypes.filter(
        (type): type is ExportFileType & { readonly id: RundownFileTypeId } =>
          isRundownFileTypeId(type.id) && tickedSet.has(type.id),
      ),
    [offeredTypes, tickedSet],
  );

  const rundownPages = useMemo(() => {
    if (
      !tickedSet.has("rundown_pdf") ||
      rundownForExport === null ||
      state.layoutRundownPages === null
    )
      return null;
    return state.layoutRundownPages(rundownForExport, {
      paper: state.paper,
      dateLabel: dateLabelFull,
      summaryLine,
      columnIds: what.selectedColumns,
      formatPageNumber: formatPosition,
    });
  }, [
    tickedSet,
    rundownForExport,
    state.layoutRundownPages,
    state.paper,
    dateLabelFull,
    summaryLine,
    what.selectedColumns,
  ]);

  const storyPages = useMemo<readonly StoryPageRef[] | null>(() => {
    const showStories =
      tickedSet.has("rundown_scripts") ||
      (!tickedSet.has("rundown_pdf") && tickedSet.has("variety_two_column"));
    if (!showStories || rundownForExport === null || state.loadingStories)
      return null;
    const list: StoryPageRef[] = [];
    for (let r = 0; r < rundownForExport.rows.length; r += 1) {
      const row = rundownForExport.rows[r]!;
      if (row.kind !== "story" || row.story === null) continue;
      for (const page of row.story.pages.pages) {
        list.push({
          key: `${r}:${page.index}`,
          pagination: row.story.pages,
          pageIndex: page.index,
          label: page.label,
        });
      }
    }
    return list;
  }, [tickedSet, rundownForExport, state.loadingStories]);

  const toggleType = (id: RundownFileTypeId, on: boolean): void => {
    setProblem(null);
    setTicked((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return [...next];
    });
  };

  const count = orderedTicked.length;
  const heading = RUNDOWN_SEND_WORDS.exportTitle(count);

  const runExport = async (): Promise<void> => {
    if (rundownForExport === null || state.rundown === null || count === 0)
      return;
    const { signal } = left.current;
    setBusy(true);
    setProblem(null);

    const work: RundownFileWork = {
      rundown: rundownForExport,
      paper: state.paper,
      dateLabel: dateLabelFull,
      summaryLine,
      columnIds: what.selectedColumns,
      airAt:
        state.rundown.rundown.airAt === null
          ? null
          : formatTime(state.rundown.rundown.airAt),
      target:
        state.rundown.rundown.targetMs === null
          ? null
          : formatDuration(state.rundown.rundown.targetMs),
      projectTitle: state.projectTitle,
      airDateFileLabel,
      now,
    };

    const written: { readonly file: WrittenFile; readonly mime: string }[] = [];
    try {
      await waitNextFrame(frame, signal);
      for (const type of orderedTicked) {
        const file = await writeRundownFile(type.id, work);
        signal.throwIfAborted();
        written.push({ file, mime: type.mime });
      }
    } catch {
      if (signal.aborted) return;
      setProblem(RUNDOWN_SEND_WORDS.exportFailed(state.displayTitle));
      setBusy(false);
      return;
    }

    for (const entry of written) {
      save(entry.file.bytes, entry.file.name, entry.mime);
    }

    const holdsStories = orderedTicked.some((type) =>
      STORY_HOLDING_FILE_TYPES.has(type.id),
    );
    if (holdsStories) {
      for (const storyId of includedStoryIds(
        filteredRows,
        state.stories,
        state.missingDocIds,
      )) {
        void history.save(storyId, "export");
      }
    }

    messages.push(exportedMessage(state.displayTitle));
    state.back();
  };

  const checksRow = state.loadingStories
    ? null
    : buildRundownChecksRow(missingRows, outsideFont);

  const rows: SendRow[] = [
    ...(checksRow === null ? [] : [checksRow]),
    {
      id: "what",
      content: (
        <RundownWhatContent
          state={what}
          allColumns={state.allColumns}
          maxRowNumber={maxRowNumber}
        />
      ),
    },
    {
      id: "as",
      content: (
        <div data-tour="send:as" className="flex flex-col items-start gap-2">
          {offeredTypes.map((type) => {
            if (!isRundownFileTypeId(type.id)) return null;
            const id = type.id;
            return (
              <CheckOption
                key={id}
                label={type.label}
                checked={tickedSet.has(id)}
                onChange={(on) => toggleType(id, on)}
              />
            );
          })}
        </div>
      ),
    },
  ];

  const canRun =
    state.ready &&
    !state.loadingStories &&
    rundownForExport !== null &&
    !rangeInvalid &&
    count > 0;

  return (
    <SendFrame
      title={heading}
      aside={null}
      rows={rows}
      pages={
        <RundownPreviewTiles
          rundownPages={rundownPages}
          storyPages={storyPages}
        />
      }
      action={{
        label: heading,
        busyLabel: count > 0 ? RUNDOWN_SEND_WORDS.exporting(count) : heading,
        busy,
        progress: null,
        cancel: null,
        disabledReason: count === 0 ? RUNDOWN_SEND_WORDS.needsFileType : null,
        problem,
        run: canRun ? () => void runExport() : null,
      }}
    />
  );
}
