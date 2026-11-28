// Direct Alignment menu button for the floating Book format bar (Left, Centre, Right).
import {
  Button,
  DOCUMENT_WORDS,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EDITOR_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@manent/ui";
import {
  AlignCenterIcon,
  AlignLeftIcon,
  AlignRightIcon,
  ChevronDownIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { keepEditorFocus } from "./keep-editor-focus.ts";

const W = DOCUMENT_WORDS.bookToolbar;

const ALIGN_OPTIONS = Object.freeze([
  {
    value: "left" as const,
    label: EDITOR_WORDS.layout.left,
    Icon: AlignLeftIcon,
  },
  {
    value: "center" as const,
    label: EDITOR_WORDS.layout.centre,
    Icon: AlignCenterIcon,
  },
  {
    value: "right" as const,
    label: EDITOR_WORDS.layout.right,
    Icon: AlignRightIcon,
  },
]);

/** Compact alignment dropdown showing the caret block's active alignment icon directly on the pill. */
export function BookAlignmentMenu(props: {
  readonly align: "left" | "center" | "right";
  readonly isCustom: boolean;
}): ReactNode {
  const { align, isCustom } = props;
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const ActiveIcon =
    align === "center"
      ? AlignCenterIcon
      : align === "right"
        ? AlignRightIcon
        : AlignLeftIcon;

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
                  aria-label={W.alignment}
                  aria-pressed={isCustom}
                  data-toolbar-item=""
                  className={
                    isCustom
                      ? "h-control-sm gap-0.5 bg-control px-1.5 text-fg"
                      : "h-control-sm gap-0.5 px-1.5 text-fg-muted hover:text-fg"
                  }
                  onMouseDown={keepEditorFocus}
                >
                  <ActiveIcon aria-hidden="true" className="size-icon" />
                  <ChevronDownIcon aria-hidden="true" className="size-3" />
                </Button>
              }
            />
          }
        />
        <TooltipContent>{W.alignment}</TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        align="center"
        finalFocus={false}
        onMouseDown={keepEditorFocus}
        className="w-36"
      >
        {ALIGN_OPTIONS.map(({ value, label, Icon }) => (
          <DropdownMenuItem
            key={value}
            data-active={align === value ? "true" : undefined}
            onClick={() => {
              editor.run({ kind: "layout", align: value });
              dom.focusPage();
            }}
          >
            <Icon aria-hidden="true" className="size-icon" />
            <span>{label}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
