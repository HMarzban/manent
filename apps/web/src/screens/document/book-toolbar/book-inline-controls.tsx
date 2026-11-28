// Inline text controls for the floating Book format bar: Bold, Italic, Underline, Colour & Highlight, and More styles.
import {
  Button,
  DOCUMENT_WORDS,
  Input,
  Label,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  keyLabel,
  useCommands,
} from "@manent/ui";
import {
  BoldIcon,
  CaseUpperIcon,
  ChevronDownIcon,
  EraserIcon,
  ItalicIcon,
  Link2Icon,
  StrikethroughIcon,
  SubscriptIcon,
  SuperscriptIcon,
  TypeIcon,
  UnderlineIcon,
} from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { useEditorFact } from "../../../state/facts.store.ts";
import { ColourHighlightPopover } from "./book-colour-popover.tsx";
import { BookFootnoteSection } from "./book-footnote-section.tsx";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;
const MARK_BIT = Object.freeze({
  bold: 1,
  italic: 2,
  underline: 4,
  strike: 8,
  caps: 16,
  link: 32,
  sup: 64,
  sub: 128,
  footnote: 256,
} as const);

const SAFE_LINK = /^(?:https?:\/\/|mailto:)/i;

function normaliseHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  if (SAFE_LINK.test(trimmed)) return trimmed;
  if (!trimmed.includes(" ") && trimmed.includes("."))
    return `https://${trimmed}`;
  return null;
}

function MarkToggle(props: {
  readonly mark: "bold" | "italic" | "underline";
  readonly label: string;
  readonly shortcut: string;
  readonly active: boolean;
  readonly icon: ReactNode;
}): ReactNode {
  const { editor } = useServices();
  const { platform } = useCommands();
  const hint = `${props.label} (${keyLabel(props.shortcut, platform)})`;
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label={props.label}
            aria-pressed={props.active}
            data-toolbar-item=""
            className={
              props.active
                ? "bg-control text-fg"
                : "text-fg-muted hover:text-fg"
            }
            onMouseDown={keepEditorFocus}
            onClick={() => editor.run({ kind: "style", mark: props.mark })}
          >
            {props.icon}
          </Button>
        }
      />
      <TooltipContent>{hint}</TooltipContent>
    </Tooltip>
  );
}

/** Leaf cluster subscribing only to caret inline-mark facts (zero renders during normal prose typing). */
export function BookInlineControls(): ReactNode {
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const mask = useEditorFact("marksMask");
  const activeColor = useEditorFact("markColor");
  const activeHighlight = useEditorFact("markHighlight");
  const currentLink = useEditorFact("markLink");
  const currentFootnote = useEditorFact("markFootnoteText");

  const [open, setOpen] = useState(false);
  const [linkOpen, setLinkOpen] = useState(false);
  const [footnoteOpen, setFootnoteOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [footnoteDraft, setFootnoteDraft] = useState("");
  const [invalid, setInvalid] = useState(false);
  const linkInputId = useId();

  const bold = (mask & MARK_BIT.bold) !== 0;
  const italic = (mask & MARK_BIT.italic) !== 0;
  const underline = (mask & MARK_BIT.underline) !== 0;
  const strike = (mask & MARK_BIT.strike) !== 0;
  const caps = (mask & MARK_BIT.caps) !== 0;
  const link = (mask & MARK_BIT.link) !== 0;
  const sup = (mask & MARK_BIT.sup) !== 0;
  const sub = (mask & MARK_BIT.sub) !== 0;
  const footnote = (mask & MARK_BIT.footnote) !== 0;
  const hasMoreStyle = strike || caps || link || sup || sub || footnote;

  const handleOpenChange = (
    next: boolean,
    details: { readonly reason: string },
  ): void => {
    setOpen(next);
    if (next) {
      setLinkOpen(link && !footnote);
      setFootnoteOpen(footnote);
      setDraft(currentLink ?? "");
      setFootnoteDraft(currentFootnote ?? "");
      setInvalid(false);
    } else if (details.reason !== "outside-press") {
      dom.focusPage();
    }
  };

  const applyLink = (): void => {
    const normalised = normaliseHref(draft);
    if (normalised === null) {
      setInvalid(true);
      return;
    }
    editor.run({ kind: "link", href: normalised === "" ? null : normalised });
    setLinkOpen(false);
    setOpen(false);
    dom.focusPage();
  };

  return (
    <div className="flex items-center gap-0.5">
      <MarkToggle
        mark="bold"
        label={W.bold}
        shortcut="Mod+B"
        active={bold}
        icon={<BoldIcon aria-hidden="true" className="size-icon" />}
      />
      <MarkToggle
        mark="italic"
        label={W.italic}
        shortcut="Mod+I"
        active={italic}
        icon={<ItalicIcon aria-hidden="true" className="size-icon" />}
      />
      <MarkToggle
        mark="underline"
        label={W.underline}
        shortcut="Mod+U"
        active={underline}
        icon={<UnderlineIcon aria-hidden="true" className="size-icon" />}
      />
      <ColourHighlightPopover
        activeColor={activeColor}
        activeHighlight={activeHighlight}
      />
      <Popover open={open} onOpenChange={handleOpenChange}>
        <Tooltip>
          <TooltipTrigger
            render={
              <PopoverTrigger
                render={
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    aria-label={W.moreStyles}
                    aria-pressed={hasMoreStyle}
                    data-toolbar-item=""
                    className={
                      hasMoreStyle
                        ? "h-control-sm gap-0.5 bg-control px-1.5 text-fg"
                        : "h-control-sm gap-0.5 px-1.5 text-fg-muted hover:text-fg"
                    }
                    onMouseDown={keepEditorFocus}
                  >
                    <TypeIcon aria-hidden="true" className="size-icon" />
                    <ChevronDownIcon aria-hidden="true" className="size-3" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>{W.moreStyles}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="start"
          initialFocus={false}
          finalFocus={false}
          onMouseDown={keepEditorFocus}
          className="w-64 p-3"
        >
          <div className="flex flex-col gap-2.5 text-ui">
            <div className="grid grid-cols-2 gap-1">
              <Button
                type="button"
                variant={strike ? "secondary" : "outline"}
                size="sm"
                aria-pressed={strike}
                className="h-control-sm justify-start gap-1.5 px-2 text-meta"
                onMouseDown={keepEditorFocus}
                onClick={() => editor.run({ kind: "style", mark: "strike" })}
              >
                <StrikethroughIcon aria-hidden="true" className="size-3.5" />
                <span>{W.strike}</span>
              </Button>
              <Button
                type="button"
                variant={caps ? "secondary" : "outline"}
                size="sm"
                aria-pressed={caps}
                className="h-control-sm justify-start gap-1.5 px-2 text-meta"
                onMouseDown={keepEditorFocus}
                onClick={() => editor.run({ kind: "style", mark: "caps" })}
              >
                <CaseUpperIcon aria-hidden="true" className="size-3.5" />
                <span>{W.caps}</span>
              </Button>
              <Button
                type="button"
                variant={sup ? "secondary" : "outline"}
                size="sm"
                aria-pressed={sup}
                className="h-control-sm justify-start gap-1.5 px-2 text-meta"
                onMouseDown={keepEditorFocus}
                onClick={() => editor.run({ kind: "style", mark: "sup" })}
              >
                <SuperscriptIcon aria-hidden="true" className="size-3.5" />
                <span>{W.superscript}</span>
              </Button>
              <Button
                type="button"
                variant={sub ? "secondary" : "outline"}
                size="sm"
                aria-pressed={sub}
                className="h-control-sm justify-start gap-1.5 px-2 text-meta"
                onMouseDown={keepEditorFocus}
                onClick={() => editor.run({ kind: "style", mark: "sub" })}
              >
                <SubscriptIcon aria-hidden="true" className="size-3.5" />
                <span>{W.subscript}</span>
              </Button>
            </div>

            <div className="flex flex-col gap-1.5 border-t border-line pt-2">
              <Button
                type="button"
                variant={link || linkOpen ? "secondary" : "outline"}
                size="sm"
                aria-pressed={link || linkOpen}
                className="h-control-sm w-full justify-start gap-1.5 px-2 text-meta"
                onClick={() => {
                  setLinkOpen((prev) => !prev);
                  setFootnoteOpen(false);
                  setDraft(currentLink ?? "");
                  setInvalid(false);
                }}
              >
                <Link2Icon aria-hidden="true" className="size-3.5" />
                <span className="truncate">{currentLink ?? W.link}</span>
              </Button>
              <BookFootnoteSection
                active={footnote}
                open={footnoteOpen}
                currentText={currentFootnote}
                draft={footnoteDraft}
                onToggle={() => {
                  setFootnoteOpen((prev) => !prev);
                  setLinkOpen(false);
                  setFootnoteDraft(currentFootnote ?? "");
                }}
                onDraftChange={setFootnoteDraft}
                onDone={() => {
                  setFootnoteOpen(false);
                  setOpen(false);
                }}
              />
            </div>

            {linkOpen ? (
              <div className="flex flex-col gap-2 rounded-control border border-line bg-subtle p-2">
                <Label htmlFor={linkInputId} className="text-micro font-medium">
                  {W.linkAddress}
                </Label>
                <Input
                  id={linkInputId}
                  type="url"
                  placeholder={W.linkPlaceholder}
                  value={draft}
                  onChange={(event) => {
                    setDraft(event.target.value);
                    if (invalid) setInvalid(false);
                  }}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    applyLink();
                  }}
                  className="h-control bg-raised! text-ui"
                />
                {invalid ? (
                  <p className="text-micro text-danger">{W.linkInvalid}</p>
                ) : null}
                <div className="flex items-center justify-between gap-2">
                  {currentLink === null ? (
                    <span />
                  ) : (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-control-sm text-meta text-fg-muted hover:text-danger"
                      onClick={() => {
                        editor.run({ kind: "link", href: null });
                        setLinkOpen(false);
                        setOpen(false);
                      }}
                    >
                      {W.removeLink}
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    className="h-control-sm"
                    onClick={applyLink}
                  >
                    {W.applyLink}
                  </Button>
                </div>
              </div>
            ) : null}

            <div className="border-t border-line pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-control-sm w-full justify-start gap-1.5 text-meta text-fg-muted hover:text-fg"
                onMouseDown={keepEditorFocus}
                onClick={() => {
                  editor.run({ kind: "clear_formatting" });
                  setOpen(false);
                }}
              >
                <EraserIcon aria-hidden="true" className="size-3.5" />
                <span>{W.clearStyle}</span>
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
