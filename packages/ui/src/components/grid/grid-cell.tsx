// One gridcell: display mode with corner mark and presence slot, or inline edit mode with validation.
import { cn } from "cn";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useId, useLayoutEffect, useRef } from "react";
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from "react";
import type { GridCell, GridColumn, GridCornerMark } from "./types.ts";

const isComposing = (event: ReactKeyboardEvent): boolean =>
  event.nativeEvent.isComposing || event.keyCode === 229;

function CornerMark({
  mark,
  descriptionId,
}: {
  readonly mark: GridCornerMark;
  readonly descriptionId: string;
}): ReactNode {
  const triangle = (
    <svg
      width="6"
      height="6"
      viewBox="0 0 6 6"
      aria-hidden="true"
      className="pointer-events-none text-attention"
    >
      <polygon points="0,0 6,0 6,6" fill="currentColor" />
    </svg>
  );
  if (mark.onOpen !== undefined) {
    const open = mark.onOpen;
    return (
      <>
        <button
          type="button"
          tabIndex={-1}
          aria-label={mark.label}
          title={mark.label}
          data-corner-mark="true"
          className="absolute top-0 end-0 flex size-3 cursor-pointer items-start justify-end border-0 bg-transparent p-0"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            open();
          }}
        >
          {triangle}
        </button>
        <span id={descriptionId} className="sr-only">
          {mark.label}
        </span>
      </>
    );
  }
  return (
    <>
      <span
        aria-hidden="true"
        data-corner-mark="true"
        className="pointer-events-none absolute top-0 end-0 flex"
      >
        {triangle}
      </span>
      <span id={descriptionId} className="sr-only">
        {mark.label}
      </span>
    </>
  );
}

interface InlineEditorProps {
  readonly rowId: string;
  readonly column: GridColumn;
  readonly isHeader: boolean;
  readonly draft: string;
  readonly initialKey: string | null;
  readonly error: string | null;
  readonly headerPlaceholder?: string;
  onDraftChange(next: string): void;
  onCommit(direction: "down" | "right" | "left" | "none"): void;
  onCancel(): void;
}

function InlineEditor({
  rowId,
  column,
  isHeader,
  draft,
  initialKey,
  error,
  headerPlaceholder,
  onDraftChange,
  onCommit,
  onCancel,
}: InlineEditorProps): ReactNode {
  const errorId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const settled = useRef(false);

  useLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    input.focus();
    if (initialKey === null) {
      input.select();
    } else {
      const end = input.value.length;
      input.setSelectionRange(end, end);
    }
  }, [initialKey]);

  const commit = (direction: "down" | "right" | "left" | "none"): void => {
    settled.current = true;
    onCommit(direction);
  };

  const cancel = (): void => {
    settled.current = true;
    onCancel();
  };

  if (column.renderEditor !== undefined) {
    return (
      <div
        className="relative flex w-full min-w-0 items-center"
        onPointerDown={(event) => event.stopPropagation()}
      >
        {column.renderEditor({
          rowId,
          columnId: column.id,
          value: draft,
          initialKey,
          error,
          onChange: onDraftChange,
          onCommit: commit,
          onCancel: cancel,
        })}
      </div>
    );
  }

  const onKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>): void => {
    if (isComposing(event)) return;
    if (
      event.key === "Enter" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      commit("down");
      return;
    }
    if (
      event.key === "Tab" &&
      !event.metaKey &&
      !event.ctrlKey &&
      !event.altKey
    ) {
      event.preventDefault();
      event.stopPropagation();
      commit(event.shiftKey ? "left" : "right");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancel();
      return;
    }
    event.stopPropagation();
  };

  return (
    <div
      className="relative flex w-full min-w-0 items-center"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <input
        ref={inputRef}
        type="text"
        aria-label={column.accessibleLabel ?? column.label}
        aria-invalid={error !== null ? "true" : undefined}
        aria-describedby={error !== null ? errorId : undefined}
        placeholder={isHeader ? headerPlaceholder : undefined}
        value={draft}
        className={cn(
          "h-control-sm w-full min-w-0 rounded-control border border-line-strong bg-well px-2 text-ui font-normal tracking-normal text-fg normal-case outline-none",
          column.numeric && !isHeader && "text-end tabular-nums",
        )}
        onChange={(event) => onDraftChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={() => {
          if (settled.current) {
            settled.current = false;
            return;
          }
          onCommit("none");
        }}
      />
      {error === null ? null : (
        <div
          id={errorId}
          role="alert"
          className="absolute start-0 top-full z-20 mt-1 flex items-center gap-1 rounded-surface border border-line bg-overlay px-2 py-1 text-meta font-normal tracking-normal whitespace-nowrap text-fg normal-case shadow-overlay"
        >
          <TriangleExclamationPointIcon
            aria-hidden="true"
            className="size-icon shrink-0 text-attention"
          />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}

export interface GridCellViewProps {
  readonly rowId: string;
  readonly column: GridColumn;
  readonly colIndex: number;
  readonly colSpan?: number;
  readonly isHeader: boolean;
  readonly cell: GridCell;
  readonly style?: CSSProperties;
  readonly active: boolean;
  readonly editable: boolean;
  readonly editing: boolean;
  readonly draft: string;
  readonly initialKey: string | null;
  readonly editError: string | null;
  readonly headerPlaceholder?: string;
  readonly rowMenu?: ReactNode;
  readonly leading?: boolean;
  onActivate(event: ReactMouseEvent<HTMLDivElement>): void;
  onStartEdit(): void;
  onDraftChange(next: string): void;
  onCommit(direction: "down" | "right" | "left" | "none"): void;
  onCancel(): void;
}

export function GridCellView({
  rowId,
  column,
  colIndex,
  colSpan,
  isHeader,
  cell,
  style,
  active,
  editable,
  editing,
  draft,
  initialKey,
  editError,
  headerPlaceholder,
  rowMenu,
  leading,
  onActivate,
  onStartEdit,
  onDraftChange,
  onCommit,
  onCancel,
}: GridCellViewProps): ReactNode {
  const cornerId = useId();
  const cornerMark = cell.cornerMark ?? null;
  const showPlaceholder =
    isHeader && cell.display === undefined && cell.value === "";

  return (
    <div
      role="gridcell"
      aria-colindex={colIndex + 1}
      aria-colspan={colSpan}
      aria-readonly={editable ? undefined : "true"}
      aria-label={cell.accessibleLabel}
      aria-describedby={cornerMark !== null ? cornerId : undefined}
      tabIndex={active ? 0 : -1}
      data-row-id={rowId}
      data-col-id={column.id}
      data-tour={cell.tourTarget}
      data-leading={leading ? "" : undefined}
      title={cell.tooltip}
      style={style}
      className={cn(
        "relative flex min-h-row min-w-0 items-center px-3 outline-none",
        isHeader
          ? "flex-1 bg-chrome text-micro font-semibold tracking-[0.04em] text-fg-muted uppercase"
          : "border-e border-line last:border-e-0",
        !isHeader && column.numeric && "mn-num",
        editable ? "cursor-pointer" : "cursor-default",
      )}
      onClick={onActivate}
      onDoubleClick={(event) => {
        if (!editable || editing) return;
        event.stopPropagation();
        onStartEdit();
      }}
    >
      {editing ? (
        <InlineEditor
          rowId={rowId}
          column={column}
          isHeader={isHeader}
          draft={draft}
          initialKey={initialKey}
          error={editError}
          headerPlaceholder={headerPlaceholder}
          onDraftChange={onDraftChange}
          onCommit={onCommit}
          onCancel={onCancel}
        />
      ) : (
        <>
          <span
            className={cn(
              "min-w-0 flex-1 truncate",
              showPlaceholder &&
                "font-normal tracking-normal text-fg-muted normal-case",
            )}
          >
            {cell.display ?? (showPlaceholder ? headerPlaceholder : cell.value)}
          </span>
          {cell.presence === undefined ? null : (
            <span
              data-presence=""
              className="ms-2 flex shrink-0 items-center gap-1"
            >
              {cell.presence}
            </span>
          )}
          {rowMenu === undefined ? null : (
            <span
              data-row-menu=""
              className="ms-2 flex shrink-0 items-center"
              onPointerDown={(event) => event.stopPropagation()}
            >
              {rowMenu}
            </span>
          )}
        </>
      )}
      {cornerMark === null ? null : (
        <CornerMark mark={cornerMark} descriptionId={cornerId} />
      )}
    </div>
  );
}
