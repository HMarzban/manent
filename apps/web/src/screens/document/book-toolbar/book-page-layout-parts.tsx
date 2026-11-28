// Sub-sections of the Book Page Layout popover: paper trims, running headers, and navigation links.
import type { Paper } from "@manent/pagination";
import type { HeaderSlots } from "@manent/settings";
import {
  Button,
  DOCUMENT_WORDS,
  HEADER_FOOTER_WORDS,
  Segmented,
  Switch,
} from "@manent/ui";
import {
  BookOpenIcon,
  FileTextIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { HEADER_PRESET_SLOTS, detectPreset } from "../header-footer-presets.ts";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;

export const PAPER_LABELS: Readonly<Record<Paper, string>> = Object.freeze({
  letter: W.paperLetter,
  a4: W.paperA4,
  trade_5x8: W.paperTrade5x8,
  trade_5_5x8_5: W.paperTrade55x85,
  trade_6x9: W.paperTrade6x9,
});

const STANDARD_PAPERS = Object.freeze([
  { value: "letter", label: W.paperLetter },
  { value: "a4", label: W.paperA4 },
]);

const PUBLISHING_PAPERS: readonly Paper[] = Object.freeze([
  "letter",
  "a4",
  "trade_5x8",
  "trade_5_5x8_5",
  "trade_6x9",
]);

const HEADER_OPTIONS = Object.freeze([
  ["none", HEADER_FOOTER_WORDS.headerPresets.none],
  ["page_number", HEADER_FOOTER_WORDS.headerPresets.page_number],
  [
    "title_and_page_number",
    HEADER_FOOTER_WORDS.headerPresets.title_and_page_number,
  ],
  ["book_and_chapter", W.headerBookAndChapter],
] as const);

/** Paper size selector (Letter/A4 on v1/v2; 5 trims + left/right margins + recto chapters on Engine 3). */
export function BookPaperSection(props: {
  readonly isBookPublishing: boolean;
  readonly paperValue: Paper;
  readonly mirrorMargins: boolean;
  readonly rectoChapters: boolean;
  readonly onPaper: (next: Paper) => void;
  readonly onMirror: (checked: boolean) => void;
  readonly onRectoChapters: (checked: boolean) => void;
}): ReactNode {
  const {
    isBookPublishing,
    paperValue,
    mirrorMargins,
    rectoChapters,
    onPaper,
    onMirror,
    onRectoChapters,
  } = props;
  if (!isBookPublishing) {
    return (
      <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <span className="font-medium text-fg">{W.paperSize}</span>
        <Segmented
          label={W.paperSize}
          value={paperValue}
          options={STANDARD_PAPERS}
          onChange={(next) => {
            if (next === "letter" || next === "a4") onPaper(next);
          }}
        />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
      <span className="font-medium text-fg">{W.paperSize}</span>
      <div className="flex flex-wrap gap-1">
        {PUBLISHING_PAPERS.map((trim) => (
          <Button
            key={trim}
            type="button"
            variant={paperValue === trim ? "secondary" : "outline"}
            size="sm"
            className="h-control-sm px-2 text-meta"
            aria-pressed={paperValue === trim}
            onClick={() => onPaper(trim)}
          >
            {PAPER_LABELS[trim]}
          </Button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-2 pt-1">
        <span className="text-fg">{W.mirrorMargins}</span>
        <Switch
          aria-label={W.mirrorMargins}
          checked={mirrorMargins}
          onCheckedChange={onMirror}
        />
      </div>
      {mirrorMargins ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-fg">{W.rectoChapters}</span>
          <Switch
            aria-label={W.rectoChapters}
            checked={rectoChapters}
            onCheckedChange={onRectoChapters}
          />
        </div>
      ) : null}
    </div>
  );
}

/** Quick running-header presets inside the Book Page Layout popover. */
export function BookHeaderPresetSection(props: {
  readonly header: HeaderSlots;
  readonly onHeader: (next: HeaderSlots) => void;
}): ReactNode {
  const { header, onHeader } = props;
  const activePreset = detectPreset(header, true);
  const apply = (id: (typeof HEADER_OPTIONS)[number][0]): void => {
    const triple = HEADER_PRESET_SLOTS[id];
    onHeader({
      ...triple,
      firstPage: header.firstPage,
      rule: header.rule,
      ...(header.suppressChapterOpenings !== undefined
        ? { suppressChapterOpenings: header.suppressChapterOpenings }
        : {}),
    });
  };
  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
      <span className="font-medium text-fg">{W.runningHeader}</span>
      <div className="grid grid-cols-2 gap-1">
        {HEADER_OPTIONS.map(([id, label]) => (
          <Button
            key={id}
            type="button"
            variant={activePreset === id ? "secondary" : "outline"}
            size="sm"
            className="h-control-sm justify-start truncate px-2 text-meta"
            onClick={() => apply(id)}
          >
            <span className="truncate">{label}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}

/** Canonical links at the footer of the Book Page Layout popover. */
export function BookLayoutLinksSection(props: {
  readonly onOpenHeaderFooter: () => void;
  readonly onOpenTitlePage: () => void;
  readonly onOpenBookStyle: () => void;
}): ReactNode {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-2">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-control-sm justify-start gap-2 text-meta text-fg-muted hover:text-fg"
        onClick={props.onOpenHeaderFooter}
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
        onClick={props.onOpenTitlePage}
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
        onClick={props.onOpenBookStyle}
      >
        <BookOpenIcon aria-hidden="true" className="size-3.5" />
        <span>{W.bookStyle}</span>
      </Button>
    </div>
  );
}
