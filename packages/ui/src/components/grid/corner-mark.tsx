// Corner change mark for an EditableGrid cell, with a 24x24 interactive hit target when clickable.
import type { ReactNode } from "react";
import type { GridCornerMark } from "./types.ts";

export function CornerMark({
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
      className="pointer-events-none text-attention transition-transform duration-(--dur-fast) group-hover/corner:scale-125"
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
          className="group/corner absolute top-0 end-0 flex size-6 cursor-pointer items-start justify-end border-0 bg-transparent p-0 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-focus"
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
