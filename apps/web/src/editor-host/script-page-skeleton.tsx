// Page-shaped loading skeleton with screenplay rhythm, sized to its scroll pane.
import { Skeleton } from "@manent/ui";
import type { ReactNode } from "react";
import { SCREENPLAY_SKELETON_BLOCKS } from "./placeholder-mount.ts";

/** A single sheet of screenplay-shaped placeholder bars inside a scrollable desk wrapper. */
export function ScriptPageSkeleton(): ReactNode {
  return (
    <div
      aria-busy="true"
      className="@container flex min-h-0 flex-1 items-start justify-center overflow-auto bg-desk p-6 @2xl:p-8"
    >
      <div className="mn-pages w-full max-w-[816px]">
        <div
          aria-hidden="true"
          className="mn-sheet flex min-h-[1056px] w-full flex-col overflow-hidden px-8 pt-10 pb-14 @2xl:px-24 @2xl:pt-16 @2xl:pb-20"
        >
          {SCREENPLAY_SKELETON_BLOCKS.map((group, i) => (
            <div key={i} className={group.className}>
              {group.bars.map((bar, j) => (
                <Skeleton key={j} className={`rounded-sm ${bar}`} />
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
