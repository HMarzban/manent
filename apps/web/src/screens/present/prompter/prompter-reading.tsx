// The prompter window's reading area: stories in run order, horizontal mirror, scroll anchoring and keyboard scroll.
import { PROMPTER_WINDOW_WORDS, Skeleton, SurfaceState } from "@manent/ui";
import type { SurfaceRenderers, SurfaceStateValue } from "@manent/ui";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import type { CSSProperties, ReactNode } from "react";
import type {
  PrompterBlockKind,
  PrompterReadingStory,
} from "./prompter-blocks.ts";
import type { PrompterTextSize } from "./prompter-storage.ts";

interface PrompterReadingProps {
  readonly surfaceState: SurfaceStateValue;
  readonly stories: readonly PrompterReadingStory[];
  readonly textSize: PrompterTextSize;
  readonly mirror: boolean;
}

interface TopAnchor {
  readonly key: string;
  readonly rowId: string;
  readonly offsetFromTop: number;
}

const LINE_HEIGHT = 1.35;
const STORY_GAP = "2.7em";
const COLUMN_MAX_WIDTH = "32ch";
const BLOCK_SELECTOR = "[data-prompter-block]";
const INTERACTIVE_SPACE_TARGET =
  'button, a, input, textarea, select, [role="switch"], [contenteditable="true"]';
const TYPING_TARGET = 'input, textarea, select, [contenteditable="true"]';

const BLOCK_STYLES: Readonly<Record<PrompterBlockKind, CSSProperties>> =
  Object.freeze({
    character: Object.freeze({
      fontSize: "0.45em",
      lineHeight: 1.4,
      marginTop: "1.1em",
      marginBottom: "0.25em",
    }),
    parenthetical: Object.freeze({
      fontSize: "0.75em",
      lineHeight: LINE_HEIGHT,
      marginTop: "0.15em",
      marginBottom: "0.15em",
    }),
    dialogue: Object.freeze({
      lineHeight: LINE_HEIGHT,
      marginTop: "0.1em",
      marginBottom: "0.1em",
    }),
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

function readTopAnchor(container: HTMLElement): TopAnchor | null {
  const top = container.getBoundingClientRect().top;
  const nodes = container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR);
  for (const node of nodes) {
    const rect = node.getBoundingClientRect();
    if (rect.bottom <= top) continue;
    const key = node.dataset.prompterBlock;
    const rowId = node.dataset.prompterRow;
    if (key !== undefined && rowId !== undefined)
      return { key, rowId, offsetFromTop: rect.top - top };
  }
  return null;
}

function findAnchorNode(
  container: HTMLElement,
  anchor: TopAnchor,
): HTMLElement | null {
  const nodes = container.querySelectorAll<HTMLElement>(BLOCK_SELECTOR);
  let rowFallback: HTMLElement | null = null;
  for (const node of nodes) {
    if (node.dataset.prompterBlock === anchor.key) return node;
    if (rowFallback === null && node.dataset.prompterRow === anchor.rowId)
      rowFallback = node;
  }
  return rowFallback;
}

function matchesSelector(
  target: EventTarget | null,
  selector: string,
): boolean {
  return target instanceof Element && target.closest(selector) !== null;
}

function scrollDelta(
  event: KeyboardEvent,
  container: HTMLElement,
  textSize: PrompterTextSize,
): number | "start" | "end" | null {
  if (event.metaKey || event.ctrlKey || event.altKey) return null;
  if (matchesSelector(event.target, TYPING_TARGET)) return null;
  const lineStep = Math.round(textSize * LINE_HEIGHT);
  const pageStep = Math.max(lineStep, container.clientHeight - lineStep);
  switch (event.key) {
    case "ArrowDown":
      return lineStep;
    case "ArrowUp":
      return -lineStep;
    case "PageDown":
      return pageStep;
    case "PageUp":
      return -pageStep;
    case " ":
      if (matchesSelector(event.target, INTERACTIVE_SPACE_TARGET)) return null;
      return event.shiftKey ? -pageStep : pageStep;
    case "Home":
      return "start";
    case "End":
      return "end";
    default:
      return null;
  }
}

function LoadingBody(): ReactNode {
  return (
    <div
      aria-busy="true"
      className="mx-auto flex w-full flex-col gap-6 px-12 py-12"
      style={{ maxWidth: COLUMN_MAX_WIDTH }}
    >
      <p className="text-ui text-fg-muted">{PROMPTER_WINDOW_WORDS.opening}</p>
      <div aria-hidden="true" className="flex flex-col gap-6">
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

function RefusedBody(): ReactNode {
  return (
    <div className="mx-auto w-full max-w-content px-12 py-12">
      <p className="text-ui text-fg">
        {PROMPTER_WINDOW_WORDS.linkRefusedDetail}
      </p>
    </div>
  );
}

function StoriesBody(props: {
  readonly stories: readonly PrompterReadingStory[];
  readonly textSize: PrompterTextSize;
  readonly mirror: boolean;
}): ReactNode {
  const { stories, textSize, mirror } = props;
  const wrapperStyle = useMemo<CSSProperties>(
    () => ({
      fontSize: `${textSize}px`,
      maxWidth: COLUMN_MAX_WIDTH,
      gap: STORY_GAP,
      paddingBottom: "50vh",
      transform: mirror ? "scaleX(-1)" : undefined,
    }),
    [textSize, mirror],
  );
  return (
    <div
      data-prompter-mirror={mirror ? "on" : "off"}
      className="mx-auto flex w-full flex-col px-12 pt-12"
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

export function PrompterReading(props: PrompterReadingProps): ReactNode {
  const { surfaceState, stories, textSize, mirror } = props;
  const scrollRef = useRef<HTMLElement | null>(null);
  const anchorRef = useRef<TopAnchor | null>(null);

  useEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    const onScroll = (): void => {
      anchorRef.current = readTopAnchor(container);
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const container = scrollRef.current;
      if (container === null) return;
      const move = scrollDelta(event, container, textSize);
      if (move === null) return;
      event.preventDefault();
      if (move === "start") container.scrollTop = 0;
      else if (move === "end") container.scrollTop = container.scrollHeight;
      else container.scrollTop += move;
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [textSize]);

  // hold the block at the top of the reading area in place across feed updates and text-size changes
  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (container === null) return;
    if (stories.length === 0) {
      anchorRef.current = null;
      return;
    }
    const previous = anchorRef.current;
    if (previous !== null) {
      const target = findAnchorNode(container, previous);
      if (target !== null) {
        const containerTop = container.getBoundingClientRect().top;
        const delta =
          target.getBoundingClientRect().top -
          containerTop -
          previous.offsetFromTop;
        if (Math.abs(delta) >= 0.5) container.scrollTop += delta;
      }
    }
    anchorRef.current = readTopAnchor(container);
  }, [stories, textSize]);

  const renderers = useMemo<SurfaceRenderers>(
    () => ({
      ready: () => (
        <StoriesBody stories={stories} textSize={textSize} mirror={mirror} />
      ),
      read_only: () => (
        <StoriesBody stories={stories} textSize={textSize} mirror={mirror} />
      ),
      offline: () => (
        <StoriesBody stories={stories} textSize={textSize} mirror={mirror} />
      ),
      empty: () => null,
      loading: () => <LoadingBody />,
      no_access: () => <RefusedBody />,
      problem: () => null,
    }),
    [stories, textSize, mirror],
  );

  return (
    <main
      ref={scrollRef}
      tabIndex={0}
      aria-label={PROMPTER_WINDOW_WORDS.readingAreaLabel}
      className="min-h-0 flex-1 overflow-y-auto bg-desk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent-solid"
    >
      <SurfaceState surface="present" state={surfaceState} render={renderers} />
    </main>
  );
}
