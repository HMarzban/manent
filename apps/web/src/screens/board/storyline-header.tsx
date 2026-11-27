// One storyline's sticky row header on the Board: lane stripe, collapse toggle, title, coverage pips, colour picker, reorder and rename.
import {
  BOARD_WORDS,
  Button,
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  Input,
} from "@manent/ui";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  ChevronRightIcon,
  PaletteIcon,
  PencilIcon,
  Trash2Icon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { STORYLINE_TONES } from "../../board/model.ts";
import type { BoardStoryline, StorylineTone } from "../../board/model.ts";
import { RowMenu } from "../library/row-place.tsx";

export interface StorylineHeaderProps {
  readonly storyline: BoardStoryline;
  readonly rowStart: number;
  readonly isLast: boolean;
  readonly canEdit: boolean;
  readonly lane?: StorylineTone;
  readonly cardCount?: number;
  readonly unlinkedCount?: number;
  readonly episodeCoverage?: readonly boolean[];
  readonly collapsed?: boolean;
  readonly canMoveUp?: boolean;
  readonly canMoveDown?: boolean;
  readonly hovered?: boolean;
  onRename(title: string): void;
  onRemove(): void;
  onSetTone?(tone: StorylineTone | null): void;
  onMove?(by: -1 | 1): void;
  onToggleCollapse?(): void;
  onHoverChange?(hovered: boolean): void;
}

export function StorylineHeader(props: StorylineHeaderProps): ReactNode {
  const {
    storyline,
    rowStart,
    canEdit,
    lane = 1,
    cardCount = 0,
    unlinkedCount = 0,
    episodeCoverage = [],
    collapsed = false,
    canMoveUp = false,
    canMoveDown = false,
    hovered = false,
    onRename,
    onRemove,
    onSetTone,
    onMove,
    onToggleCollapse,
    onHoverChange,
  } = props;
  const [renaming, setRenaming] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const blurArmedRef = useRef(false);
  const settledRef = useRef(false);

  useEffect(() => {
    if (!renaming) {
      blurArmedRef.current = false;
      return;
    }
    settledRef.current = false;
    blurArmedRef.current = false;
    const raf = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
      blurArmedRef.current = true;
    });
    return () => cancelAnimationFrame(raf);
  }, [renaming]);

  const startRename = (): void => {
    if (!canEdit) return;
    setDraft(storyline.title);
    setRenaming(true);
  };

  const commit = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    setRenaming(false);
    const trimmed = draft.trim();
    if (trimmed !== "" && trimmed !== storyline.title) onRename(trimmed);
  };

  const cancelRename = (): void => {
    if (settledRef.current) return;
    settledRef.current = true;
    setRenaming(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    event.stopPropagation();
    if (event.key === "Enter" && !event.nativeEvent.isComposing) {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape") {
      event.preventDefault();
      cancelRename();
    }
  };

  const explicitTone = storyline.tone ?? null;
  const menuItems = (
    <>
      <DropdownMenuItem onClick={startRename}>
        <PencilIcon aria-hidden="true" className="size-icon shrink-0" />
        <span>{BOARD_WORDS.rename}</span>
      </DropdownMenuItem>
      {onSetTone !== undefined ? (
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <PaletteIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{BOARD_WORDS.laneColour}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem onClick={() => onSetTone(null)}>
              <span className="flex-1">{BOARD_WORDS.laneColourAuto}</span>
              {explicitTone === null ? (
                <CheckIcon
                  aria-hidden="true"
                  className="size-icon shrink-0 text-fg-accent"
                />
              ) : null}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            {STORYLINE_TONES.map((tone) => (
              <DropdownMenuItem key={tone} onClick={() => onSetTone(tone)}>
                <span
                  aria-hidden="true"
                  data-lane={tone}
                  className="mn-board-lane-dot"
                />
                <span className="flex-1">
                  {BOARD_WORDS.laneColourOption(tone)}
                </span>
                {explicitTone === tone ? (
                  <CheckIcon
                    aria-hidden="true"
                    className="size-icon shrink-0 text-fg-accent"
                  />
                ) : null}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      ) : null}
      {onMove !== undefined ? (
        <>
          <DropdownMenuItem disabled={!canMoveUp} onClick={() => onMove(-1)}>
            <ArrowUpIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{BOARD_WORDS.moveStorylineUp}</span>
          </DropdownMenuItem>
          <DropdownMenuItem disabled={!canMoveDown} onClick={() => onMove(1)}>
            <ArrowDownIcon aria-hidden="true" className="size-icon shrink-0" />
            <span>{BOARD_WORDS.moveStorylineDown}</span>
          </DropdownMenuItem>
        </>
      ) : null}
      <DropdownMenuSeparator />
      <DropdownMenuItem variant="destructive" onClick={onRemove}>
        <Trash2Icon aria-hidden="true" className="size-icon shrink-0" />
        <span>{BOARD_WORDS.remove}</span>
      </DropdownMenuItem>
    </>
  );

  const cell = (
    <div
      data-lane={lane}
      data-lane-hover={hovered ? "true" : undefined}
      data-collapsed={collapsed ? "true" : undefined}
      data-storyline-header={storyline.id}
      style={{ gridColumn: 1, gridRow: rowStart }}
      onPointerEnter={() => onHoverChange?.(true)}
      onPointerLeave={() => onHoverChange?.(false)}
      className="mn-board-rail group/storyline flex flex-col justify-start gap-1 px-2.5 py-2"
    >
      <div className="flex items-start gap-1">
        {onToggleCollapse !== undefined ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-expanded={!collapsed}
            aria-label={
              collapsed
                ? BOARD_WORDS.expandStoryline(storyline.title)
                : BOARD_WORDS.collapseStoryline(storyline.title)
            }
            onClick={onToggleCollapse}
            className="-ms-1 mt-0.5 shrink-0 text-fg-muted hover:text-fg"
          >
            <ChevronRightIcon
              aria-hidden="true"
              data-open={collapsed ? undefined : "true"}
              className="mn-tree-chevron size-3.5"
            />
          </Button>
        ) : null}
        {renaming && canEdit ? (
          <Input
            ref={inputRef}
            autoFocus
            aria-label={BOARD_WORDS.rename}
            placeholder={BOARD_WORDS.storylinePlaceholder}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={() => {
              if (blurArmedRef.current) commit();
            }}
            onKeyDown={onKeyDown}
            className="h-control-sm min-w-0 flex-1"
          />
        ) : (
          <span
            className="min-w-0 flex-1 pt-0.5 text-ui leading-snug font-semibold break-words text-fg"
            onDoubleClick={canEdit ? startRename : undefined}
          >
            {storyline.title}
          </span>
        )}
        {canEdit && !renaming ? (
          <span className="shrink-0 opacity-0 transition-opacity duration-(--dur-fast) group-hover/storyline:opacity-100 group-focus-within/storyline:opacity-100 has-[[data-popup-open]]:opacity-100 [@media(hover:none)]:opacity-100">
            <RowMenu title={storyline.title}>{menuItems}</RowMenu>
          </span>
        ) : null}
      </div>
      {!collapsed && !renaming ? (
        <div
          className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-micro text-fg-muted tabular-nums${onToggleCollapse !== undefined ? " ps-6" : ""}`}
        >
          <span>{BOARD_WORDS.cardCount(cardCount)}</span>
          {unlinkedCount > 0 ? (
            <span>{BOARD_WORDS.unlinkedCount(unlinkedCount)}</span>
          ) : null}
          {episodeCoverage.length > 0 ? (
            <span
              aria-hidden="true"
              className="flex items-center gap-0.5 pt-0.5"
            >
              {episodeCoverage.map((filled, idx) => (
                <span
                  key={idx}
                  data-filled={filled ? "true" : undefined}
                  className="mn-board-pip"
                />
              ))}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );

  if (!canEdit || renaming) return cell;
  return (
    <ContextMenu>
      <ContextMenuTrigger render={cell} />
      <ContextMenuContent>{menuItems}</ContextMenuContent>
    </ContextMenu>
  );
}
