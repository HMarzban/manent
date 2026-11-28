// Book Page Layout popover for the floating Book format bar: paper, lines per page, running headers, white page and canonical links.
import { defaultLinesPerPage, maxLinesPerPage } from "@manent/pagination";
import type { Paper } from "@manent/pagination";
import type { HeaderSlots } from "@manent/settings";
import {
  Button,
  DOCUMENT_WORDS,
  HEADER_FOOTER_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Segmented,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import {
  BookOpenIcon,
  ChevronDownIcon,
  FileTextIcon,
  MinusIcon,
  PlusIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { openDetailsAt } from "../details-tab.tsx";
import { HEADER_PRESET_SLOTS, detectPreset } from "../header-footer-presets.ts";
import { requestScriptSettingsOpen } from "../script-settings-part.ts";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;
const MIN_LINES = 10;

const PAPER_OPTIONS = Object.freeze([
  { value: "letter", label: W.paperLetter },
  { value: "a4", label: W.paperA4 },
]);

const LINE_SPACING_OPTIONS = Object.freeze([
  { value: "single", label: W.singleSpacing },
  { value: "double", label: W.doubleSpacing },
]);

const NONE_SLOT = Object.freeze({ kind: "none" as const });
const CHAPTER_HEADER_SLOTS: HeaderSlots = Object.freeze({
  left: Object.freeze({ kind: "section" as const }),
  center: NONE_SLOT,
  right: Object.freeze({ kind: "page_number" as const }),
  firstPage: false,
  rule: false,
});

function isChapterHeader(header: HeaderSlots): boolean {
  return (
    header.left.kind === "section" &&
    header.center.kind === "none" &&
    header.right.kind === "page_number"
  );
}

/** Compact icon-first Page Layout popover with live summary in its tooltip and header. */
export function BookPageLayoutPopover(props: {
  readonly docId: string;
}): ReactNode {
  const { docId } = props;
  const services = useServices();
  const { dom, frame } = useEnvironment();
  const [open, setOpen] = useState(false);
  const scriptStore = useMemo(
    () => services.openScriptStore(docId),
    [services, docId],
  );

  const paper = useSyncExternalStore(
    useCallback(
      (notify: () => void) => scriptStore.subscribe("script.paper", notify),
      [scriptStore],
    ),
    () => scriptStore.get("script.paper"),
  );
  const customLines = useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        scriptStore.subscribe("script.linesPerPage", notify),
      [scriptStore],
    ),
    () => scriptStore.get("script.linesPerPage"),
  );
  const lineSpacing = useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        scriptStore.subscribe("script.lineSpacing", notify),
      [scriptStore],
    ),
    () => scriptStore.get("script.lineSpacing"),
  );
  const header = useSyncExternalStore(
    useCallback(
      (notify: () => void) => scriptStore.subscribe("script.header", notify),
      [scriptStore],
    ),
    () => scriptStore.get("script.header"),
  );
  const whitePage = useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        services.settings.subscribe("appearance.whitePage", notify),
      [services.settings],
    ),
    () => services.settings.get("appearance.whitePage"),
  );

  const paperValue: Paper = paper === "a4" ? "a4" : "letter";
  const paperLabel = paperValue === "a4" ? W.paperA4 : W.paperLetter;
  const defaultLines = defaultLinesPerPage("manuscript", paperValue);
  const maxLines = maxLinesPerPage("manuscript", paperValue);
  const effectiveLines = customLines ?? defaultLines;
  const summary = W.layoutSummary(paperLabel, effectiveLines);

  const activeHeaderPreset = isChapterHeader(header)
    ? "chapter_and_page"
    : detectPreset(header, true);

  const applyHeaderPreset = (
    id: "none" | "page_number" | "title_and_page_number" | "chapter_and_page",
  ): void => {
    if (id === "chapter_and_page") {
      scriptStore.set("script.header", {
        ...CHAPTER_HEADER_SLOTS,
        firstPage: header.firstPage,
        rule: header.rule,
      });
      return;
    }
    const triple = HEADER_PRESET_SLOTS[id];
    scriptStore.set("script.header", {
      ...triple,
      firstPage: header.firstPage,
      rule: header.rule,
    });
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next, details) => {
        setOpen(next);
        if (!next && details.reason !== "outside-press") dom.focusPage();
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <PopoverTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={W.pageLayout}
                  data-toolbar-item=""
                  className="h-control-sm gap-0.5 px-1.5 text-fg-muted hover:text-fg"
                  onMouseDown={keepEditorFocus}
                >
                  <BookOpenIcon
                    aria-hidden="true"
                    className="size-icon shrink-0"
                  />
                  <ChevronDownIcon
                    aria-hidden="true"
                    className="size-3 shrink-0"
                  />
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          {W.layoutTooltip(paperLabel, effectiveLines)}
        </TooltipContent>
      </Tooltip>
      <PopoverContent
        align="end"
        initialFocus={false}
        finalFocus={false}
        onMouseDown={keepEditorFocus}
        className="w-76 p-3"
      >
        <div className="flex flex-col gap-3 text-ui">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-fg">{W.pageLayout}</span>
            <span className="text-micro text-fg-muted tabular-nums">
              {summary}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <span className="font-medium text-fg">{W.paperSize}</span>
            <Segmented
              label={W.paperSize}
              value={paperValue}
              options={PAPER_OPTIONS}
              onChange={(next) => {
                if (next === "letter" || next === "a4") {
                  scriptStore.set("script.paper", next);
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <span className="font-medium text-fg">{W.lineSpacing}</span>
            <Segmented
              label={W.lineSpacing}
              value={lineSpacing === "single" ? "single" : "double"}
              options={LINE_SPACING_OPTIONS}
              onChange={(next) => {
                if (next === "single" || next === "double") {
                  scriptStore.set("script.lineSpacing", next);
                }
              }}
            />
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <div className="flex flex-col">
              <span className="font-medium text-fg">{W.linesPerPage}</span>
              {customLines !== null ? (
                <button
                  type="button"
                  className="self-start text-micro text-fg-muted underline-offset-2 hover:text-fg hover:underline"
                  onClick={() => scriptStore.set("script.linesPerPage", null)}
                >
                  {W.defaultLines(defaultLines)}
                </button>
              ) : null}
            </div>
            <div className="flex items-center gap-1 tabular-nums">
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={W.decreaseLines}
                disabled={effectiveLines <= MIN_LINES}
                onClick={() =>
                  scriptStore.set(
                    "script.linesPerPage",
                    Math.max(MIN_LINES, effectiveLines - 2),
                  )
                }
              >
                <MinusIcon aria-hidden="true" className="size-3" />
              </Button>
              <span className="w-10 text-center text-meta text-fg">
                {effectiveLines}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon-sm"
                aria-label={W.increaseLines}
                disabled={effectiveLines >= maxLines}
                onClick={() =>
                  scriptStore.set(
                    "script.linesPerPage",
                    Math.min(maxLines, effectiveLines + 2),
                  )
                }
              >
                <PlusIcon aria-hidden="true" className="size-3" />
              </Button>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
            <span className="font-medium text-fg">{W.runningHeader}</span>
            <div className="grid grid-cols-2 gap-1">
              {(
                [
                  ["none", HEADER_FOOTER_WORDS.headerPresets.none],
                  [
                    "page_number",
                    HEADER_FOOTER_WORDS.headerPresets.page_number,
                  ],
                  [
                    "title_and_page_number",
                    HEADER_FOOTER_WORDS.headerPresets.title_and_page_number,
                  ],
                  ["chapter_and_page", W.headerChapterAndPage],
                ] as const
              ).map(([id, label]) => (
                <Button
                  key={id}
                  type="button"
                  variant={activeHeaderPreset === id ? "secondary" : "outline"}
                  size="sm"
                  className="h-control-sm justify-start truncate px-2 text-meta"
                  onClick={() => applyHeaderPreset(id)}
                >
                  <span className="truncate">{label}</span>
                </Button>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <span className="text-fg">{W.whitePage}</span>
            <Switch
              aria-label={W.whitePage}
              checked={whitePage}
              onCheckedChange={(checked) =>
                services.settings.set("appearance.whitePage", checked)
              }
            />
          </div>

          <div className="flex flex-col gap-0.5 border-t border-line pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-control-sm justify-start gap-2 text-meta text-fg-muted hover:text-fg"
              onClick={() => {
                setOpen(false);
                requestScriptSettingsOpen();
                openDetailsAt("script", frame);
              }}
            >
              <SlidersHorizontalIcon aria-hidden="true" className="size-3.5" />
              <span>{W.headerAndFooter}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-control-sm justify-start gap-2 text-meta text-fg-muted hover:text-fg"
              onMouseDown={keepEditorFocus}
              onClick={() => {
                setOpen(false);
                services.editor.showTitlePage();
              }}
            >
              <FileTextIcon aria-hidden="true" className="size-3.5" />
              <span>{W.titlePage}</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-control-sm justify-start gap-2 text-meta text-fg-muted hover:text-fg"
              onMouseDown={keepEditorFocus}
              onClick={() => {
                setOpen(false);
                queueMicrotask(() => {
                  if (document.activeElement instanceof HTMLElement) {
                    document.activeElement.blur();
                  }
                  services.commands.run("project.openSettings", "control");
                });
              }}
            >
              <BookOpenIcon aria-hidden="true" className="size-3.5" />
              <span>{W.bookStyle}</span>
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
