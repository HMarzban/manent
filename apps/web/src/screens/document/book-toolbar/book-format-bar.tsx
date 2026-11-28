// Floating Book Format Bar (ADR 0086): centred over the manuscript page column (`gridArea: "page"`),
// zero stacked bars, zero subscriptions on non-manuscript formats, true roving tabindex and calm writing dim.
import {
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuShortcut,
  DropdownMenuTrigger,
  EDITOR_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommands,
} from "@manent/ui";
import {
  BookMarkedIcon,
  ChevronDownIcon,
  EllipsisIcon,
  ImagePlusIcon,
  PlusIcon,
  QuoteIcon,
  SeparatorHorizontalIcon,
  SparklesIcon,
} from "lucide-react";
import {
  useCallback,
  useLayoutEffect,
  useRef,
  useSyncExternalStore,
} from "react";
import type { FocusEvent, KeyboardEvent, ReactNode } from "react";
import { useWritingFocusAttr } from "../../../demo/demo-stage-hooks.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { useEditorFact } from "../../../state/facts.store.ts";
import { useFormattingBarShown } from "../../../state/formatting-bar.store.ts";
import { useCanEdit } from "../ruler-bar.tsx";
import { BookInlineControls } from "./book-inline-controls.tsx";
import { BookPageLayoutPopover } from "./book-page-layout.tsx";
import { BookParagraphControls } from "./book-paragraph-controls.tsx";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const PAGE_AREA = Object.freeze({ gridArea: "page" });
const PAGE_REGION = "[data-region='page']";
const FLOATING_BAR_ATTR = "data-floating-bar";
const W = DOCUMENT_WORDS.bookToolbar;

const BOOK_ELEMENTS = Object.freeze([
  {
    slot: "1" as const,
    type: "chapter",
    label: EDITOR_WORDS.elements.chapter,
    chord: "Mod+1",
  },
  {
    slot: "2" as const,
    type: "body",
    label: EDITOR_WORDS.elements.body,
    chord: "Mod+2",
  },
  {
    slot: "5" as const,
    type: "quote",
    label: EDITOR_WORDS.elements.quote,
    chord: "Mod+5",
  },
  {
    slot: "6" as const,
    type: "break",
    label: EDITOR_WORDS.elements.break,
    chord: "Mod+6",
  },
  {
    slot: "8" as const,
    type: "group",
    label: EDITOR_WORDS.elements.group,
    chord: "Mod+8",
  },
  {
    slot: "9" as const,
    type: "act_break",
    label: EDITOR_WORDS.actBreaks.new_act,
    chord: "Mod+9",
  },
]);

function ElementPicker(): ReactNode {
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const { platform } = useCommands();
  const element = useEditorFact("element") ?? EDITOR_WORDS.elements.body;
  const blockType = useEditorFact("blockType");

  return (
    <DropdownMenu
      onOpenChange={(next, details) => {
        if (!next && details.reason !== "outside-press") dom.focusPage();
      }}
    >
      <DropdownMenuTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={W.element}
            data-toolbar-item=""
            className="h-control-sm min-w-22 justify-between gap-1 px-2 text-ui font-medium text-fg"
            onMouseDown={keepEditorFocus}
          >
            <span className="truncate">{element}</span>
            <ChevronDownIcon
              aria-hidden="true"
              className="size-3 shrink-0 text-fg-muted"
            />
          </Button>
        }
      />
      <DropdownMenuContent
        align="start"
        finalFocus={false}
        onMouseDown={keepEditorFocus}
        className="w-48"
      >
        {BOOK_ELEMENTS.map((item) => (
          <DropdownMenuItem
            key={item.slot}
            data-active={blockType === item.type ? "true" : undefined}
            onClick={() => {
              editor.run({ kind: "element", slot: item.slot });
              dom.focusPage();
            }}
          >
            <span>{item.label}</span>
            <DropdownMenuShortcut>
              {keyLabel(item.chord, platform)}
            </DropdownMenuShortcut>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function InsertMenu(props: { readonly overflow?: boolean }): ReactNode {
  const { commands, editor } = useServices();
  const { dom } = useEnvironment();
  const { platform } = useCommands();
  return (
    <DropdownMenu
      onOpenChange={(next, details) => {
        if (!next && details.reason !== "outside-press") dom.focusPage();
      }}
    >
      <Tooltip>
        <TooltipTrigger
          render={
            <DropdownMenuTrigger
              render={
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={props.overflow ? W.moreControls : W.insert}
                  data-toolbar-item=""
                  className="h-control-sm gap-0.5 px-1.5 text-fg-muted hover:text-fg"
                  onMouseDown={keepEditorFocus}
                >
                  {props.overflow ? (
                    <EllipsisIcon aria-hidden="true" className="size-icon" />
                  ) : (
                    <>
                      <PlusIcon aria-hidden="true" className="size-icon" />
                      <ChevronDownIcon aria-hidden="true" className="size-3" />
                    </>
                  )}
                </Button>
              }
            />
          }
        />
        <TooltipContent>
          {props.overflow ? W.moreControls : W.insert}
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="end"
        finalFocus={false}
        onMouseDown={keepEditorFocus}
        className="w-48"
      >
        <DropdownMenuItem
          onClick={() => {
            editor.run({ kind: "insert_chapter" });
            dom.focusPage();
          }}
        >
          <BookMarkedIcon aria-hidden="true" className="size-icon" />
          <span>{W.newChapter}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            editor.run({ kind: "element", slot: "5" });
            dom.focusPage();
          }}
        >
          <QuoteIcon aria-hidden="true" className="size-icon" />
          <span>{W.quote}</span>
          <DropdownMenuShortcut>
            {keyLabel("Mod+5", platform)}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            editor.run({ kind: "insert_break" });
            dom.focusPage();
          }}
        >
          <SparklesIcon aria-hidden="true" className="size-icon" />
          <span>{W.sceneBreak}</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => {
            editor.run({ kind: "page_break" });
            dom.focusPage();
          }}
        >
          <SeparatorHorizontalIcon aria-hidden="true" className="size-icon" />
          <span>{W.pageBreak}</span>
          <DropdownMenuShortcut>
            {keyLabel("Mod+Enter", platform)}
          </DropdownMenuShortcut>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => commands.run("graphics.insertImage", "control")}
        >
          <ImagePlusIcon aria-hidden="true" className="size-icon" />
          <span>{W.insertFigure}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function Divider(): ReactNode {
  return (
    <span aria-hidden="true" className="mx-0.5 h-4 w-px shrink-0 bg-line" />
  );
}

/** Syncs WAI-ARIA roving tabindex so the entire floating pill is a single Tab stop. */
function syncRovingTabIndex(
  root: HTMLElement,
  active?: HTMLElement | null,
): HTMLButtonElement[] {
  const items = [
    ...root.querySelectorAll<HTMLButtonElement>(
      "[data-toolbar-item]:not(:disabled)",
    ),
  ];
  if (items.length === 0) return items;
  const target =
    active instanceof HTMLButtonElement && items.includes(active)
      ? active
      : (items.find((item) => item.tabIndex === 0) ?? items[0]!);
  for (const item of items) item.tabIndex = item === target ? 0 : -1;
  return items;
}

function FloatingBookPill(props: { readonly docId: string }): ReactNode {
  const { dom } = useEnvironment();
  const pillRef = useRef<HTMLDivElement>(null);
  useWritingFocusAttr(pillRef, false);

  useLayoutEffect(() => {
    const region = document.querySelector<HTMLElement>(PAGE_REGION);
    const desk = region?.querySelector<HTMLElement>(".mn-desk") ?? null;
    const beforePad =
      desk === null
        ? 0
        : Number.parseFloat(getComputedStyle(desk).paddingTop) || 0;
    region?.setAttribute(FLOATING_BAR_ATTR, "true");
    if (region !== null && desk !== null && region.scrollTop > 0) {
      const afterPad =
        Number.parseFloat(getComputedStyle(desk).paddingTop) || 0;
      region.scrollTop = Math.max(0, region.scrollTop + (afterPad - beforePad));
    }
    if (pillRef.current !== null) syncRovingTabIndex(pillRef.current);
    return () => {
      const prevPad =
        desk === null
          ? 0
          : Number.parseFloat(getComputedStyle(desk).paddingTop) || 0;
      region?.removeAttribute(FLOATING_BAR_ATTR);
      if (region !== null && desk !== null && region.scrollTop > 0) {
        const nextPad =
          Number.parseFloat(getComputedStyle(desk).paddingTop) || 0;
        region.scrollTop = Math.max(0, region.scrollTop + (nextPad - prevPad));
      }
    };
  }, []);

  const onFocus = (event: FocusEvent<HTMLDivElement>): void => {
    const root = pillRef.current;
    if (root !== null && event.target instanceof HTMLButtonElement) {
      syncRovingTabIndex(root, event.target);
    }
  };

  const onKeyDownCapture = (event: KeyboardEvent<HTMLDivElement>): void => {
    const root = pillRef.current;
    if (root === null) return;
    if (event.key === "Escape") {
      const openPopup = root.querySelector('[aria-expanded="true"]');
      if (openPopup !== null) return;
      event.preventDefault();
      dom.focusPage();
      return;
    }
    const items = syncRovingTabIndex(root);
    if (items.length === 0) return;
    const current = items.indexOf(event.target as HTMLButtonElement);
    if (current < 0) return;
    const rtl = getComputedStyle(root).direction === "rtl";
    const forward = rtl ? "ArrowLeft" : "ArrowRight";
    const backward = rtl ? "ArrowRight" : "ArrowLeft";
    let next = -1;
    if (event.key === forward) next = (current + 1) % items.length;
    else if (event.key === backward)
      next = (current - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = items[next]!;
    syncRovingTabIndex(root, target);
    target.focus({ preventScroll: true });
  };

  return (
    <div
      data-tour="book-toolbar"
      style={PAGE_AREA}
      className="@container pointer-events-none z-10 flex items-start justify-center self-start px-3 pt-2.5"
    >
      <div
        ref={pillRef}
        role="toolbar"
        aria-label={W.label}
        onMouseDown={keepEditorFocus}
        onFocus={onFocus}
        onKeyDownCapture={onKeyDownCapture}
        className="mn-book-pill pointer-events-auto flex min-h-control-lg max-w-full flex-nowrap items-center gap-0.5 overflow-x-auto rounded-surface px-1.5 py-1 text-ui"
      >
        <ElementPicker />
        <Divider />
        <BookInlineControls />
        <Divider />
        <BookParagraphControls />
        <div className="hidden items-center gap-0.5 @[26rem]:flex">
          <Divider />
          <InsertMenu />
          <BookPageLayoutPopover docId={props.docId} />
        </div>
        <div className="flex items-center @[26rem]:hidden">
          <Divider />
          <InsertMenu overflow />
        </div>
      </div>
    </div>
  );
}

/**
 * Floats top-centre over the manuscript page column when editing a `manuscript` document and Format bar is on.
 * Renders nothing with zero editor-fact subscriptions on all other formats or read-only views.
 */
export function BookFormatBar(props: { readonly docId: string }): ReactNode {
  const { docId } = props;
  const services = useServices();
  const shown = useFormattingBarShown();
  const editable = useCanEdit(docId);
  const store = services.openScriptStore(docId);
  const subscribeFormat = useCallback(
    (notify: () => void) => store.subscribe("script.format", notify),
    [store],
  );
  const format = useSyncExternalStore(subscribeFormat, () =>
    store.get("script.format"),
  );
  if (format !== "manuscript" || !shown || !editable) return null;
  return <FloatingBookPill docId={docId} />;
}
