// Book prose craft controls: direct Alignment picker, 1-click Drop cap toggle, and Space & indent popover.
import { CELLS_PER_INCH } from "@manent/pagination";
import {
  Button,
  DOCUMENT_WORDS,
  EDITOR_WORDS,
  Popover,
  PopoverContent,
  PopoverTrigger,
  Switch,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import {
  ChevronDownIcon,
  MinusIcon,
  PilcrowIcon,
  PlusIcon,
  RotateCcwIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { useEditorFact } from "../../../state/facts.store.ts";
import { rulerActions, useRulerShown } from "../../../state/ruler.store.ts";
import { BookAlignmentMenu } from "./book-alignment-menu.tsx";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;
const MAX_SPACE_BEFORE = 10;

const OPENING_OPTIONS = Object.freeze([
  { value: "default" as const, label: W.indented },
  { value: "flush" as const, label: W.flushLeft },
  { value: "drop_cap" as const, label: W.dropCap },
  { value: "raised_cap" as const, label: W.raisedCap },
]);

const formatInches = (cells: number): string =>
  EDITOR_WORDS.layout.inches((cells / CELLS_PER_INCH).toFixed(1));

function defaultAlignFor(blockType: string | null): "left" | "center" {
  return blockType === "chapter" ||
    blockType === "break" ||
    blockType === "act_break"
    ? "center"
    : "left";
}

function DropCapIcon(): ReactNode {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="size-icon"
    >
      <path d="M2 12.5 4.8 3.5l2.8 9" />
      <path d="M3 9.75h3.6" />
      <path d="M9.5 4.5H14" />
      <path d="M9.5 8H14" />
      <path d="M9.5 11.5H14" />
    </svg>
  );
}

function StepperRow(props: {
  readonly label: string;
  readonly valueText: string;
  readonly decreaseLabel: string;
  readonly increaseLabel: string;
  readonly disableDecrease: boolean;
  readonly disableIncrease: boolean;
  readonly onDecrease: () => void;
  readonly onIncrease: () => void;
  readonly divided?: boolean;
}): ReactNode {
  return (
    <div
      className={
        props.divided
          ? "flex items-center justify-between gap-2 border-t border-line pt-2.5 first:border-t-0 first:pt-0"
          : "flex items-center justify-between gap-2"
      }
    >
      <span className="text-fg-muted">{props.label}</span>
      <div className="flex items-center gap-1 tabular-nums">
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={props.decreaseLabel}
          disabled={props.disableDecrease}
          onMouseDown={keepEditorFocus}
          onClick={props.onDecrease}
        >
          <MinusIcon aria-hidden="true" className="size-3" />
        </Button>
        <span className="w-14 text-center text-meta text-fg">
          {props.valueText}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon-sm"
          aria-label={props.increaseLabel}
          disabled={props.disableIncrease}
          onMouseDown={keepEditorFocus}
          onClick={props.onIncrease}
        >
          <PlusIcon aria-hidden="true" className="size-3" />
        </Button>
      </div>
    </div>
  );
}

/** Leaf cluster subscribing only to block-level layout and opening-line facts. */
export function BookParagraphControls(): ReactNode {
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const blockType = useEditorFact("blockType");
  const firstLine = useEditorFact("blockFirstLine");
  const align = useEditorFact("blockAlign");
  const spaceBefore = useEditorFact("blockSpaceBefore");
  const spaceBeforeSet = useEditorFact("blockSpaceBeforeSet") === true;
  const indent = useEditorFact("blockIndent");
  const width = useEditorFact("blockWidth");
  const columnCells = useEditorFact("columnCells");
  const rulerShown = useRulerShown();

  const isBody = blockType === "body" || blockType === null;
  const isDropCap = firstLine === "drop_cap";
  const effectiveAlign =
    align === "center" || align === "right" ? align : "left";
  const hasCustomAlign = align !== null && align !== defaultAlignFor(blockType);
  const hasCustomLayout = firstLine !== null || spaceBeforeSet;
  const effectiveSpaceBefore = spaceBefore ?? 0;

  return (
    <div className="flex items-center gap-0.5">
      <BookAlignmentMenu align={effectiveAlign} isCustom={hasCustomAlign} />

      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label={W.dropCap}
              aria-pressed={isDropCap}
              disabled={!isBody}
              data-toolbar-item=""
              className={
                isDropCap ? "bg-control text-fg" : "text-fg-muted hover:text-fg"
              }
              onMouseDown={keepEditorFocus}
              onClick={() =>
                editor.run({
                  kind: "first_line",
                  value: isDropCap ? null : "drop_cap",
                })
              }
            >
              <DropCapIcon />
            </Button>
          }
        />
        <TooltipContent>{isBody ? W.dropCap : W.dropCapHint}</TooltipContent>
      </Tooltip>

      <Popover
        onOpenChange={(next, details) => {
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
                    aria-label={W.spaceAndIndent}
                    aria-pressed={hasCustomLayout}
                    data-toolbar-item=""
                    className={
                      hasCustomLayout
                        ? "h-control-sm gap-0.5 bg-control px-1.5 text-fg"
                        : "h-control-sm gap-0.5 px-1.5 text-fg-muted hover:text-fg"
                    }
                    onMouseDown={keepEditorFocus}
                  >
                    <PilcrowIcon aria-hidden="true" className="size-icon" />
                    <ChevronDownIcon aria-hidden="true" className="size-3" />
                  </Button>
                }
              />
            }
          />
          <TooltipContent>{W.spaceAndIndent}</TooltipContent>
        </Tooltip>
        <PopoverContent
          align="center"
          initialFocus={false}
          finalFocus={false}
          onMouseDown={keepEditorFocus}
          className="w-72 p-3"
        >
          <div className="flex flex-col gap-3 text-ui">
            {isBody ? (
              <div className="flex flex-col gap-1.5">
                <span className="text-micro font-medium text-fg-muted">
                  {W.opening}
                </span>
                <div className="grid grid-cols-2 gap-1">
                  {OPENING_OPTIONS.map((option) => {
                    const active = (firstLine ?? "default") === option.value;
                    return (
                      <Button
                        key={option.value}
                        type="button"
                        variant={active ? "secondary" : "outline"}
                        size="sm"
                        aria-pressed={active}
                        className="h-control-sm justify-center px-2 text-meta"
                        onMouseDown={keepEditorFocus}
                        onClick={() =>
                          editor.run({
                            kind: "first_line",
                            value:
                              option.value === "default" ? null : option.value,
                          })
                        }
                      >
                        <span>{option.label}</span>
                      </Button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            <StepperRow
              divided
              label={W.spaceBefore}
              valueText={EDITOR_WORDS.layout.lines(effectiveSpaceBefore)}
              decreaseLabel={W.decreaseSpaceBefore}
              increaseLabel={W.increaseSpaceBefore}
              disableDecrease={effectiveSpaceBefore <= 0}
              disableIncrease={effectiveSpaceBefore >= MAX_SPACE_BEFORE}
              onDecrease={() =>
                editor.run({
                  kind: "layout",
                  spaceBefore: Math.max(0, effectiveSpaceBefore - 1),
                })
              }
              onIncrease={() =>
                editor.run({
                  kind: "layout",
                  spaceBefore: Math.min(
                    MAX_SPACE_BEFORE,
                    effectiveSpaceBefore + 1,
                  ),
                })
              }
            />

            {indent !== null && width !== null && columnCells !== null ? (
              <>
                <StepperRow
                  label={W.indent}
                  valueText={formatInches(indent)}
                  decreaseLabel={W.decreaseIndent}
                  increaseLabel={W.increaseIndent}
                  disableDecrease={indent <= 0}
                  disableIncrease={indent + 1 >= columnCells}
                  onDecrease={() =>
                    editor.run({
                      kind: "layout",
                      indent: Math.max(0, indent - 1),
                    })
                  }
                  onIncrease={() =>
                    editor.run({ kind: "layout", indent: indent + 1 })
                  }
                />
                <StepperRow
                  label={W.width}
                  valueText={formatInches(width)}
                  decreaseLabel={W.decreaseWidth}
                  increaseLabel={W.increaseWidth}
                  disableDecrease={width <= 10}
                  disableIncrease={indent + width >= columnCells}
                  onDecrease={() =>
                    editor.run({
                      kind: "layout",
                      width: Math.max(10, width - 1),
                    })
                  }
                  onIncrease={() =>
                    editor.run({
                      kind: "layout",
                      width: Math.min(columnCells - indent, width + 1),
                    })
                  }
                />
              </>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t border-line pt-2.5">
              <span className="text-fg-muted">{W.ruler}</span>
              <Switch
                aria-label={W.ruler}
                checked={rulerShown}
                onCheckedChange={() => rulerActions.toggle()}
              />
            </div>

            <div className="border-t border-line pt-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-control-sm w-full justify-start gap-1.5 text-meta text-fg-muted hover:text-fg"
                onMouseDown={keepEditorFocus}
                onClick={() => {
                  editor.run({
                    kind: "layout",
                    indent: null,
                    width: null,
                    align: null,
                    spaceBefore: null,
                  });
                  editor.run({ kind: "first_line", value: null });
                }}
              >
                <RotateCcwIcon aria-hidden="true" className="size-3.5" />
                <span>{W.resetLayout}</span>
              </Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}
