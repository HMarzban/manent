// Dedicated Colour & Highlight popover for the floating Book format bar with live-tinted trigger and theme-token swatches.
import {
  Button,
  DOCUMENT_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import { BanIcon, ChevronDownIcon, EraserIcon } from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;
const TEXT_COLOURS = ["red", "orange", "green", "blue", "violet"] as const;
const HIGHLIGHT_COLOURS = [
  "yellow",
  "green",
  "pink",
  "orange",
  "violet",
] as const;

/** Colour & Highlight trigger with a live colour underline bar, active highlight dot, and working theme swatches. */
export function ColourHighlightPopover(props: {
  readonly activeColor: string | null;
  readonly activeHighlight: string | null;
}): ReactNode {
  const { activeColor, activeHighlight } = props;
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const [open, setOpen] = useState(false);
  const hasAny = activeColor !== null || activeHighlight !== null;

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
                  aria-label={W.colourAndHighlight}
                  aria-pressed={hasAny}
                  data-toolbar-item=""
                  className={
                    hasAny
                      ? "h-control-sm gap-1 bg-control px-1.5 text-fg"
                      : "h-control-sm gap-1 px-1.5 text-fg-muted hover:text-fg"
                  }
                  onMouseDown={keepEditorFocus}
                >
                  <span className="flex flex-col items-center justify-center">
                    <svg
                      aria-hidden="true"
                      viewBox="0 0 14 11"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-2.5 w-3.5"
                    >
                      <path d="M3.2 10 7 1.4 10.8 10" />
                      <path d="M4.6 7.2h4.8" />
                    </svg>
                    <span
                      aria-hidden="true"
                      className="mn-colour-bar mt-0.5"
                      data-color={activeColor ?? undefined}
                    />
                  </span>
                  {activeHighlight !== null ? (
                    <span
                      aria-hidden="true"
                      className="mn-colour-dot"
                      data-swatch={`hl-${activeHighlight}`}
                    />
                  ) : null}
                  <ChevronDownIcon aria-hidden="true" className="size-3" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{W.colourAndHighlight}</TooltipContent>
      </Tooltip>
      <PopoverContent
        align="start"
        initialFocus={false}
        finalFocus={false}
        onMouseDown={keepEditorFocus}
        className="w-64 p-3"
      >
        <div className="flex flex-col gap-3 text-ui">
          <div className="flex flex-col gap-1.5">
            <span className="text-micro font-medium text-fg-muted">
              {W.colour}
            </span>
            <div className="grid grid-cols-6 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mn-swatch-item rounded-full"
                aria-label={W.colourChoice(W.none)}
                aria-pressed={activeColor === null}
                title={W.none}
                onMouseDown={keepEditorFocus}
                onClick={() => editor.run({ kind: "colour", value: null })}
              >
                <span
                  className="mn-swatch"
                  data-swatch="text-none"
                  data-active={activeColor === null ? "" : undefined}
                >
                  <BanIcon aria-hidden="true" className="size-3" />
                </span>
              </Button>
              {TEXT_COLOURS.map((colour) => {
                const name = W.textColours[colour];
                const active = activeColor === colour;
                return (
                  <Button
                    key={colour}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mn-swatch-item rounded-full"
                    aria-label={W.colourChoice(name)}
                    aria-pressed={active}
                    title={name}
                    onMouseDown={keepEditorFocus}
                    onClick={() =>
                      editor.run({ kind: "colour", value: colour })
                    }
                  >
                    <span
                      className="mn-swatch"
                      data-swatch={`text-${colour}`}
                      data-active={active ? "" : undefined}
                    />
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-1.5 border-t border-line pt-2.5">
            <span className="text-micro font-medium text-fg-muted">
              {W.highlight}
            </span>
            <div className="grid grid-cols-6 gap-1">
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="mn-swatch-item rounded-full"
                aria-label={W.highlightChoice(W.none)}
                aria-pressed={activeHighlight === null}
                title={W.none}
                onMouseDown={keepEditorFocus}
                onClick={() => editor.run({ kind: "highlight", value: null })}
              >
                <span
                  className="mn-swatch"
                  data-swatch="hl-none"
                  data-active={activeHighlight === null ? "" : undefined}
                >
                  <BanIcon aria-hidden="true" className="size-3" />
                </span>
              </Button>
              {HIGHLIGHT_COLOURS.map((colour) => {
                const name = W.highlightColours[colour];
                const active = activeHighlight === colour;
                return (
                  <Button
                    key={colour}
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    className="mn-swatch-item rounded-full"
                    aria-label={W.highlightChoice(name)}
                    aria-pressed={active}
                    title={name}
                    onMouseDown={keepEditorFocus}
                    onClick={() =>
                      editor.run({ kind: "highlight", value: colour })
                    }
                  >
                    <span
                      className="mn-swatch"
                      data-swatch={`hl-${colour}`}
                      data-active={active ? "" : undefined}
                    />
                  </Button>
                );
              })}
            </div>
          </div>

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
  );
}
