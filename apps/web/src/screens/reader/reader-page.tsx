// Read-only true pages for a sent draft, scaled to a phone's width (< 600 px) with page numbers kept in their margins.
import { engineFor } from "@manent/pagination";
import type { Comparison } from "@manent/revisions";
import type { DocJSON } from "@manent/schema";
import type { VersionContent } from "@manent/sync-protocol";
import { EDITOR_WORDS } from "@manent/ui";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { mountVersionView } from "../../editor-host/version-view.ts";
import type { VersionView } from "../../editor-host/version-view.ts";
import { draftPageWidthPx } from "../../reader/reader-compare.ts";
import type { PersonServices } from "../../services/ports.ts";

const PHONE_BREAKPOINT_PX = 600;
const PHONE_PADDING_PX = 16;
const DESKTOP_PADDING_PX = 32;
const DEFAULT_PAGE_WIDTH_PX = 816;

export interface TappedLine {
  readonly blockId: string;
  readonly place: { readonly left: number; readonly top: number };
}

function zoomHeightOf(place: HTMLElement): number {
  const zoom = place.querySelector<HTMLElement>(".mn-zoom");
  if (zoom === null) return 0;
  const parsed = Number.parseFloat(zoom.style.height);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : zoom.offsetHeight;
}

export function ReaderPage(props: {
  content: VersionContent;
  watermark: string | null;
  comparison?: {
    readonly baseline: DocJSON;
    readonly comparison: Comparison;
  } | null;
  commentedBlockIds?: ReadonlySet<string>;
  ports: PersonServices["pagePorts"];
  title: string;
  tappable: boolean;
  onTapLine(tapped: TappedLine): void;
}): ReactNode {
  const {
    content,
    watermark,
    comparison = null,
    commentedBlockIds,
    ports,
    title,
    tappable,
    onTapLine,
  } = props;
  const scrollerRef = useRef<HTMLDivElement>(null);
  const placeRef = useRef<HTMLDivElement>(null);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [unscaledHeight, setUnscaledHeight] = useState(0);

  const pageWidth = draftPageWidthPx(content) ?? DEFAULT_PAGE_WIDTH_PX;

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (scroller === null) return;
    const measure = (): void => {
      const width = scroller.clientWidth;
      if (width > 0) setViewportWidth(width);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller);
    return () => observer.disconnect();
  }, []);

  const isPhone = viewportWidth > 0 && viewportWidth < PHONE_BREAKPOINT_PX;
  const padding = isPhone ? PHONE_PADDING_PX : DESKTOP_PADDING_PX;
  const scale =
    viewportWidth > 0 && viewportWidth - padding < pageWidth
      ? Math.max(0.25, (viewportWidth - padding) / pageWidth)
      : 1;
  const scaled = scale < 1;

  useLayoutEffect(() => {
    const element = placeRef.current;
    if (element === null) return undefined;
    const view: VersionView = mountVersionView({
      place: element,
      content,
      ports,
      offFontNote: EDITOR_WORDS.offFontNote,
      comparison: comparison?.comparison ?? null,
      baseline: comparison?.baseline ?? null,
      sceneIds: null,
      engineFor,
      watermark,
    });
    const syncHeight = (): void => {
      const height = zoomHeightOf(element);
      if (height > 0) setUnscaledHeight(height);
    };
    syncHeight();
    const observer = new MutationObserver(syncHeight);
    observer.observe(element, {
      attributes: true,
      attributeFilter: ["style"],
      subtree: true,
      childList: true,
    });
    return () => {
      observer.disconnect();
      view.destroy();
    };
  }, [content, watermark, comparison, ports]);

  // When scaled below 100%, the unscaled mount matches total content height so every sheet renders cleanly.
  useLayoutEffect(() => {
    const element = placeRef.current;
    if (!scaled || element === null || unscaledHeight <= 0) return;
    element.dispatchEvent(new Event("scroll"));
  }, [scaled, unscaledHeight, scale]);

  // Mark public-commented lines subtly so readers can see and re-open comments on the page.
  useLayoutEffect(() => {
    const element = placeRef.current;
    if (element === null) return;
    const syncMarks = (): void => {
      for (const node of element.querySelectorAll<HTMLElement>("[data-id]")) {
        const id = node.getAttribute("data-id");
        if (id !== null && commentedBlockIds?.has(id)) {
          node.setAttribute("data-reader-commented", "true");
        } else {
          node.removeAttribute("data-reader-commented");
        }
      }
    };
    syncMarks();
    const observer = new MutationObserver(syncMarks);
    observer.observe(element, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [commentedBlockIds, content]);

  const handleClick = (event: MouseEvent<HTMLDivElement>): void => {
    if (!tappable) return;
    if (!(event.target instanceof Element)) return;
    const block = event.target.closest<HTMLElement>("[data-id]");
    if (block === null) return;
    const blockId = block.getAttribute("data-id");
    if (blockId === null || blockId === "") return;
    const rect = block.getBoundingClientRect();
    onTapLine({
      blockId,
      place: { left: rect.left, top: rect.bottom + 4 },
    });
  };

  return (
    <div
      ref={scrollerRef}
      data-region="page"
      data-reader-scaled={scaled ? "true" : "false"}
      className={
        scaled
          ? "min-h-0 flex-1 overflow-y-auto overflow-x-hidden bg-desk p-2"
          : "min-h-0 flex-1 overflow-hidden bg-desk"
      }
    >
      <div
        data-tour="page"
        className={scaled ? "relative mx-auto" : "h-full"}
        style={
          scaled
            ? {
                width: `${pageWidth * scale}px`,
                height:
                  unscaledHeight > 0
                    ? `${unscaledHeight * scale}px`
                    : undefined,
              }
            : undefined
        }
      >
        <div
          ref={placeRef}
          tabIndex={0}
          aria-label={title}
          onClick={handleClick}
          className={
            scaled
              ? tappable
                ? "mn-reader-page [&_[data-id]]:cursor-pointer"
                : "mn-reader-page"
              : tappable
                ? "mn-desk mn-reader-page relative h-full overflow-auto overscroll-contain [&>.mn-zoom]:mx-auto [&_[data-id]]:cursor-pointer"
                : "mn-desk mn-reader-page relative h-full overflow-auto overscroll-contain [&>.mn-zoom]:mx-auto"
          }
          style={
            scaled
              ? {
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: `${pageWidth}px`,
                  height:
                    unscaledHeight > 0 ? `${unscaledHeight}px` : undefined,
                  transform: `scale(${scale})`,
                  transformOrigin: "0 0",
                  overflow: "visible",
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
