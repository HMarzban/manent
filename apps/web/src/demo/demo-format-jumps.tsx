// One-click Writers' room format showcase strip inside the Stage Sheet's Tour tab.
import { docPath, seedProject } from "@manent/demo";
import { DEMO_WORDS } from "@manent/ui";
import {
  BookOpenIcon,
  ClapperboardIcon,
  ImageIcon,
  MicIcon,
  SparklesIcon,
  TheaterIcon,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

interface FormatJump {
  readonly id: string;
  readonly label: string;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
}

const FORMAT_JUMPS: readonly FormatJump[] = Object.freeze([
  {
    id: "book",
    label: DEMO_WORDS.formatBook,
    href: docPath("medium/the-salt-almanac/manuscript"),
    icon: BookOpenIcon,
  },
  {
    id: "stage-play",
    label: DEMO_WORDS.formatStagePlay,
    href: docPath("medium/pier-four-at-low-water/script"),
    icon: TheaterIcon,
  },
  {
    id: "multicam",
    label: DEMO_WORDS.formatMulticam,
    href: `/p/${seedProject("medium/platform-two").projectId}/board`,
    icon: ClapperboardIcon,
  },
  {
    id: "animation",
    label: DEMO_WORDS.formatAnimation,
    href: docPath("medium/tin-boat/101"),
    icon: SparklesIcon,
  },
  {
    id: "podcast",
    label: DEMO_WORDS.formatPodcast,
    href: docPath("medium/harbour-tape/ep1"),
    icon: MicIcon,
  },
  {
    id: "graphics",
    label: DEMO_WORDS.formatBroadcastGraphics,
    href: docPath("medium/lannick-one-news/stories/07"),
    icon: ImageIcon,
  },
]);

export function DemoFormatJumps(props: {
  readonly signedIn: boolean;
  readonly onOpenPath?: (href: string) => void;
}): ReactNode {
  const { signedIn, onOpenPath } = props;
  if (!signedIn || onOpenPath === undefined) return null;

  return (
    <div className="flex flex-col gap-1.5 border-t border-line pt-2">
      <span className="text-micro font-semibold tracking-wide text-fg-muted uppercase">
        {DEMO_WORDS.tryFormatsHeading}
      </span>
      <div className="grid grid-cols-3 gap-1.5">
        {FORMAT_JUMPS.map((jump) => {
          const Icon = jump.icon;
          return (
            <button
              key={jump.id}
              type="button"
              onClick={() => onOpenPath(jump.href)}
              className="flex cursor-pointer items-center gap-1.5 rounded-control border border-line bg-overlay px-2 py-1.5 text-left text-meta font-medium text-fg transition-colors hover:border-line-strong hover:bg-chrome focus-visible:outline-2 focus-visible:outline-focus"
            >
              <Icon
                aria-hidden="true"
                className="size-3.5 shrink-0 text-fg-muted"
              />
              <span className="truncate">{jump.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
