// The Send screen's Print body for a rundown: Rundown PDF or All scripts as one PDF, with What, Checks and preview tiles.
import {
  EDITOR_WORDS,
  RUNDOWN_SEND_WORDS,
  SEND_WORDS,
  Segmented,
  formatPosition,
} from "@manent/ui";
import { useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { SendFormProps } from "../../screens/send/forms.ts";
import { SendFrame } from "../../screens/send/send-frame.tsx";
import type { SendRow } from "../../screens/send/send-frame.tsx";
import { typesPrinted } from "../../send/file-types.ts";
import { drawSheet, engineOf } from "../../send/print-pages.ts";
import { useEnvironment, useServices } from "../../services/context.tsx";
import {
  buildRundownForExport,
  collectMissingRows,
  collectOutsideFontSentence,
  filterRundownRows,
  formatAirDateFull,
  includedStoryIds,
  maxRowNumberOf,
  summaryLineOf,
} from "./rundown-export-model.ts";
import { RundownPreviewTiles } from "./rundown-preview-tiles.tsx";
import type { StoryPageRef } from "./rundown-preview-tiles.tsx";
import {
  RundownWhatContent,
  buildRundownChecksRow,
  useRundownWhatState,
} from "./rundown-send-parts.tsx";
import { drawRundownSheet, printRundownSheets } from "./rundown-sheets.ts";
import { useRundownSend } from "./use-rundown-send.ts";

type RundownPrintTypeId = "rundown_pdf" | "rundown_scripts";

const RUNDOWN_OFFERED_TO = Object.freeze({
  docKind: "rundown" as const,
  format: "variety" as const,
  locked: false,
});

function useInitialPrintType(): RundownPrintTypeId {
  const searchStr = useRouterState({
    select: (state): string => state.location.searchStr,
  });
  return new URLSearchParams(searchStr).get("as") === "rundown_scripts"
    ? "rundown_scripts"
    : "rundown_pdf";
}

/** Print form body for a rundown document on the Send screen. */
export function RundownPrint(props: SendFormProps): ReactNode {
  const { docId } = props;
  const { history } = useServices();
  const { frame } = useEnvironment();
  const state = useRundownSend(docId);

  const printedTypes = useMemo(() => typesPrinted(RUNDOWN_OFFERED_TO), []);
  const initialType = useInitialPrintType();
  const [printType, setPrintType] = useState<RundownPrintTypeId>(
    () => initialType,
  );
  const [busy, setBusy] = useState(false);
  const [built, setBuilt] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const building = useRef<AbortController | null>(null);
  useEffect(() => () => building.current?.abort(), []);

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

  const rundownPages = useMemo(() => {
    if (
      printType !== "rundown_pdf" ||
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
    printType,
    rundownForExport,
    state.layoutRundownPages,
    state.paper,
    dateLabelFull,
    summaryLine,
    what.selectedColumns,
  ]);

  const storyPages = useMemo<readonly StoryPageRef[] | null>(() => {
    if (
      printType !== "rundown_scripts" ||
      rundownForExport === null ||
      state.loadingStories
    )
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
  }, [printType, rundownForExport, state.loadingStories]);

  const pageCount =
    !state.ready || state.loadingStories || rangeInvalid
      ? null
      : printType === "rundown_pdf"
        ? (rundownPages?.length ?? null)
        : (storyPages?.length ?? null);

  const heading =
    pageCount === null || pageCount === 0
      ? RUNDOWN_SEND_WORDS.print
      : RUNDOWN_SEND_WORDS.printTitle(pageCount);

  const runPrint = async (): Promise<void> => {
    const controller = new AbortController();
    building.current = controller;
    setBusy(true);
    setProblem(null);
    setBuilt(0);

    try {
      if (printType === "rundown_pdf") {
        if (rundownPages === null || rundownPages.length === 0)
          throw new RangeError("no rundown pages to print");
        const first = rundownPages[0]!;
        await printRundownSheets({
          sheets: rundownPages.map((page) => () => drawRundownSheet(page)),
          widthPt: first.widthPt,
          heightPt: first.heightPt,
          frame,
          signal: controller.signal,
          onBuilt: setBuilt,
        });
      } else {
        if (storyPages === null || storyPages.length === 0)
          throw new RangeError("no story pages to print");
        const firstGeom = storyPages[0]!.pagination.profile.geometry;
        await printRundownSheets({
          sheets: storyPages.map(
            (entry) => () =>
              drawSheet(
                engineOf(entry.pagination),
                entry.pagination,
                entry.pageIndex,
              ),
          ),
          widthPt: firstGeom.widthPt,
          heightPt: firstGeom.heightPt,
          frame,
          signal: controller.signal,
          onBuilt: setBuilt,
        });
      }
    } catch {
      building.current = null;
      setBusy(false);
      if (!controller.signal.aborted)
        setProblem(RUNDOWN_SEND_WORDS.printFailed(state.displayTitle));
      return;
    }

    building.current = null;
    if (printType === "rundown_scripts") {
      for (const storyId of includedStoryIds(
        filteredRows,
        state.stories,
        state.missingDocIds,
      )) {
        void history.save(storyId, "export");
      }
    }
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
        <div data-tour="send:as">
          <Segmented
            label={SEND_WORDS.as}
            value={printType}
            options={printedTypes.map(({ id, label }) => ({
              value: id,
              label,
            }))}
            onChange={(value) => {
              setProblem(null);
              setPrintType(
                value === "rundown_scripts" ? "rundown_scripts" : "rundown_pdf",
              );
            }}
          />
        </div>
      ),
    },
  ];

  const canRun = pageCount !== null && pageCount > 0;

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
        busyLabel:
          pageCount === null || pageCount === 0
            ? heading
            : RUNDOWN_SEND_WORDS.preparing(pageCount),
        busy,
        progress:
          busy && pageCount !== null
            ? EDITOR_WORDS.send.progress(built, pageCount)
            : null,
        cancel: busy ? () => building.current?.abort() : null,
        disabledReason: null,
        problem,
        run: canRun ? () => void runPrint() : null,
      }}
    />
  );
}
