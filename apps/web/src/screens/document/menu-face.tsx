// The face of a bar's menu button: its words, then a chevron, on the band a quiet button draws.
import { cn } from "@manent/ui";
import { ChevronDownIcon } from "lucide-react";
import type { ReactNode } from "react";

const HEIGHTS = Object.freeze({ default: "h-control", sm: "h-control-sm" });

/** `title` is the full text shown on hover when the words are cut short. */
export function MenuFace(props: {
  size: keyof typeof HEIGHTS;
  title?: string;
  children: ReactNode;
}): ReactNode {
  return (
    <span
      className={cn(
        "group/menu-face flex items-center gap-1 rounded-control px-2 transition-colors hover:bg-subtle active:bg-control",
        HEIGHTS[props.size],
      )}
      title={props.title}
    >
      <span className="truncate">{props.children}</span>
      <ChevronDownIcon
        aria-hidden="true"
        className="size-icon shrink-0 text-fg-muted duration-(--dur-fast) ease-out group-hover/menu-face:text-fg in-data-popup-open:rotate-180 motion-safe:transition-transform"
      />
    </span>
  );
}
