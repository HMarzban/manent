// Book Page Layout popover for the floating Book format bar: trims, Engine 3 book layout, line spacing, headers and links.
import {
  defaultLinesPerPage,
  maxLinesPerPage,
  parsePaper,
} from "@manent/pagination";
import type { Paper } from "@manent/pagination";
import {
  Button,
  DOCUMENT_WORDS,
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
  MinusIcon,
  PlusIcon,
} from "lucide-react";
import { useCallback, useMemo, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { openDetailsAt } from "../details-tab.tsx";
import { requestScriptSettingsOpen } from "../script-settings-part.ts";
import {
  BookHeaderPresetSection,
  BookLayoutLinksSection,
  BookPaperSection,
  PAPER_LABELS,
} from "./book-page-layout-parts.tsx";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;
const MIN_LINES = 10;

const LINE_SPACING_OPTIONS = Object.freeze([
  { value: "single", label: W.singleSpacing },
  { value: "double", label: W.doubleSpacing },
]);

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
  const sub = useCallback(
    (key: Parameters<typeof scriptStore.subscribe>[0]) =>
      (notify: () => void) =>
        scriptStore.subscribe(key, notify),
    [scriptStore],
  );
  const paper = useSyncExternalStore(
    useMemo(() => sub("script.paper"), [sub]),
    () => scriptStore.get("script.paper"),
  );
  const customLines = useSyncExternalStore(
    useMemo(() => sub("script.linesPerPage"), [sub]),
    () => scriptStore.get("script.linesPerPage"),
  );
  const lineSpacing = useSyncExternalStore(
    useMemo(() => sub("script.lineSpacing"), [sub]),
    () => scriptStore.get("script.lineSpacing"),
  );
  const header = useSyncExternalStore(
    useMemo(() => sub("script.header"), [sub]),
    () => scriptStore.get("script.header"),
  );
  const engineVersion = useSyncExternalStore(
    useMemo(() => sub("script.engineVersion"), [sub]),
    () => scriptStore.get("script.engineVersion"),
  );
  const mirrorMargins = useSyncExternalStore(
    useMemo(() => sub("script.mirrorMargins"), [sub]),
    () => scriptStore.get("script.mirrorMargins"),
  );
  const whitePage = useSyncExternalStore(
    useCallback(
      (notify: () => void) =>
        services.settings.subscribe("appearance.whitePage", notify),
      [services.settings],
    ),
    () => services.settings.get("appearance.whitePage"),
  );

  const isBookPublishing = engineVersion >= 3;
  const paperValue: Paper = parsePaper(paper, engineVersion);
  const paperLabel = PAPER_LABELS[paperValue];
  const defaultLines = defaultLinesPerPage(
    "manuscript",
    paperValue,
    engineVersion,
  );
  const maxLines = maxLinesPerPage("manuscript", paperValue, engineVersion);
  const effectiveLines = customLines ?? defaultLines;
  const summary = W.layoutSummary(paperLabel, effectiveLines);

  const toggleBookPublishing = (checked: boolean): void => {
    if (checked) {
      scriptStore.set("script.engineVersion", 3);
      return;
    }
    if (paperValue !== "letter" && paperValue !== "a4") {
      scriptStore.set("script.paper", "letter");
    }
    scriptStore.set("script.engineVersion", 2);
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
        className="w-80 p-3"
      >
        <div className="flex flex-col gap-3 text-ui">
          <div className="flex items-baseline justify-between gap-2">
            <span className="font-semibold text-fg">{W.pageLayout}</span>
            <span className="text-micro text-fg-muted tabular-nums">
              {summary}
            </span>
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
            <div className="flex min-w-0 flex-col">
              <span className="font-medium text-fg">{W.bookPublishing}</span>
              <span className="text-micro text-fg-muted">
                {W.bookPublishingNote}
              </span>
            </div>
            <Switch
              aria-label={W.bookPublishing}
              checked={isBookPublishing}
              onCheckedChange={toggleBookPublishing}
            />
          </div>

          <BookPaperSection
            isBookPublishing={isBookPublishing}
            paperValue={paperValue}
            mirrorMargins={mirrorMargins}
            onPaper={(next) => scriptStore.set("script.paper", next)}
            onMirror={(checked) =>
              scriptStore.set("script.mirrorMargins", checked)
            }
          />

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

          <BookHeaderPresetSection
            header={header}
            onHeader={(next) => scriptStore.set("script.header", next)}
          />

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

          <BookLayoutLinksSection
            onOpenHeaderFooter={() => {
              setOpen(false);
              requestScriptSettingsOpen();
              openDetailsAt("script", frame);
            }}
            onOpenTitlePage={() => {
              setOpen(false);
              services.editor.showTitlePage();
            }}
            onOpenBookStyle={() => {
              setOpen(false);
              queueMicrotask(() => {
                if (document.activeElement instanceof HTMLElement) {
                  document.activeElement.blur();
                }
                services.commands.run("project.openSettings", "control");
              });
            }}
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}
