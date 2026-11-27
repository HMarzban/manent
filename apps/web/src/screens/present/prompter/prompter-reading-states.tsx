// Loading skeleton, scrollable EmptyHeroCard states, and stories column for the prompter reading surface.
import { Button, PROMPTER_WINDOW_WORDS, Skeleton } from "@manent/ui";
import { useMemo } from "react";
import type { CSSProperties, ReactNode } from "react";
import { EmptyHeroCard } from "../../../empty-hero-card.tsx";
import type {
  PrompterBlockKind,
  PrompterReadingStory,
} from "./prompter-blocks.ts";
import type { PrompterTextSize } from "./prompter-storage.ts";

export const PROMPTER_LINE_HEIGHT = 1.35;
export const PROMPTER_COLUMN_MAX_WIDTH = "32ch";

const BLOCK_STYLES: Readonly<Record<PrompterBlockKind, CSSProperties>> =
  Object.freeze({
    character: {
      fontSize: "0.45em",
      lineHeight: 1.4,
      marginTop: "1.1em",
      marginBottom: "0.25em",
    },
    parenthetical: {
      fontSize: "0.75em",
      lineHeight: PROMPTER_LINE_HEIGHT,
      marginTop: "0.15em",
      marginBottom: "0.15em",
    },
    dialogue: {
      lineHeight: PROMPTER_LINE_HEIGHT,
      marginTop: "0.1em",
      marginBottom: "0.1em",
    },
  });
const FIRST_CHARACTER_STYLE: CSSProperties = Object.freeze({
  ...BLOCK_STYLES.character,
  marginTop: 0,
});
const BLOCK_CLASSES: Readonly<Record<PrompterBlockKind, string>> =
  Object.freeze({
    character: "font-semibold uppercase tracking-[0.06em] text-fg-muted",
    parenthetical: "italic font-normal text-fg-muted",
    dialogue: "font-medium text-fg",
  });

export function PrompterStoriesBody(props: {
  readonly stories: readonly PrompterReadingStory[];
  readonly textSize: PrompterTextSize;
  readonly mirror: boolean;
}): ReactNode {
  const { stories, textSize, mirror } = props;
  const wrapperStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${textSize}px`,
      maxWidth: PROMPTER_COLUMN_MAX_WIDTH,
      gap: "2.7em",
      paddingTop: "30vh",
      paddingBottom: "70vh",
      transform: mirror ? "scaleX(-1)" : undefined,
    }),
    [textSize, mirror],
  );
  return (
    <div
      data-prompter-mirror={mirror ? "on" : "off"}
      className="mx-auto flex w-full shrink-0 flex-col px-4 sm:px-12"
      style={wrapperStyle}
    >
      {stories.map((story) => (
        <section key={story.rowId} data-prompter-story={story.rowId}>
          {story.blocks.map((block, index) => (
            <p
              key={block.key}
              data-prompter-block={block.key}
              data-prompter-row={story.rowId}
              data-block-kind={block.kind}
              className={BLOCK_CLASSES[block.kind]}
              style={
                index === 0 && block.kind === "character"
                  ? FIRST_CHARACTER_STYLE
                  : BLOCK_STYLES[block.kind]
              }
            >
              {block.text}
            </p>
          ))}
        </section>
      ))}
    </div>
  );
}

export function PrompterLoadingBody(): ReactNode {
  return (
    <div
      className="mx-auto flex w-full flex-col gap-6 px-4 py-12 sm:px-12"
      style={{ maxWidth: PROMPTER_COLUMN_MAX_WIDTH }}
    >
      <p role="status" className="text-ui text-fg-muted">
        {PROMPTER_WINDOW_WORDS.opening}
      </p>
      <div aria-busy="true" aria-hidden="true" className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-11/12" />
          <Skeleton className="h-7 w-4/5" />
        </div>
        <div className="flex flex-col gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-2 h-4 w-20" />
          <Skeleton className="h-7 w-full" />
          <Skeleton className="h-7 w-5/6" />
        </div>
      </div>
    </div>
  );
}

export function PrompterHero(props: {
  readonly icon: ReactNode;
  readonly title: string;
  readonly description?: string;
  readonly actionLabel?: string;
  readonly onAction?: () => void;
}): ReactNode {
  const { icon, title, description, actionLabel, onAction } = props;
  const actions =
    actionLabel !== undefined && onAction !== undefined ? (
      <Button variant="outline" onClick={onAction}>
        {actionLabel}
      </Button>
    ) : null;
  return (
    <div className="flex min-h-0 flex-1 overflow-y-auto p-6">
      <div className="flex min-h-full w-full flex-col items-center justify-center">
        <EmptyHeroCard
          icon={icon}
          title={title}
          description={description}
          actions={actions}
        />
      </div>
    </div>
  );
}
