// Connects a prompter window to its rundown's live feed and persists the last received feed for offline opening.
import type { BlockJSON } from "@manent/schema";
import type { PrompterHandle, PrompterStatus } from "@manent/sync-client";
import type { PrompterRow } from "@manent/sync-protocol";
import { useEffect, useMemo, useRef, useState } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { projectPrompterStories } from "./prompter-blocks.ts";
import type { PrompterReadingStory } from "./prompter-blocks.ts";
import {
  mapToStories,
  readCachedFeed,
  storiesToMap,
  writeCachedFeed,
} from "./prompter-storage.ts";

export interface PrompterFeedView {
  readonly feed: PrompterStatus["feed"];
  readonly lastReceivedAt: number | null;
  readonly hasFeed: boolean;
  readonly loadingSinceMs: number;
  readonly stories: readonly PrompterReadingStory[];
}

interface FeedSnapshot {
  readonly rundownId: string;
  readonly feed: PrompterStatus["feed"];
  readonly lastReceivedAt: number | null;
  readonly hasFeed: boolean;
  readonly loadingSinceMs: number;
  readonly runOrder: readonly PrompterRow[];
  readonly stories: ReadonlyMap<string, readonly BlockJSON[]>;
}

const EMPTY_STORIES: ReadonlyMap<string, readonly BlockJSON[]> = new Map();

function initialSnapshot(
  storage: Storage | null,
  rundownId: string,
  online: boolean,
  nowMs: number,
): FeedSnapshot {
  const cached = readCachedFeed(storage, rundownId);
  return {
    rundownId,
    feed: online ? "waiting" : "lost",
    lastReceivedAt: cached?.lastReceivedAt ?? null,
    hasFeed: cached !== null,
    loadingSinceMs: nowMs,
    runOrder: cached?.runOrder ?? [],
    stories: cached === null ? EMPTY_STORIES : storiesToMap(cached.stories),
  };
}

function persistFeed(
  storage: Storage | null,
  rundownId: string,
  runOrder: readonly PrompterRow[],
  stories: ReadonlyMap<string, readonly BlockJSON[]>,
  lastReceivedAt: number | null,
): void {
  writeCachedFeed(storage, rundownId, {
    v: 1,
    runOrder,
    stories: mapToStories(stories),
    lastReceivedAt,
  });
}

/**
 * Opens `rundownId`'s prompter feed, showing any last received feed from storage immediately while connecting or offline,
 * updating live with no reload when frames arrive, and keeping the cache up to date.
 */
export function usePrompterFeed(rundownId: string): PrompterFeedView {
  const services = useServices();
  const { storage, now, online } = useEnvironment();
  const [snapshot, setSnapshot] = useState<FeedSnapshot>(() =>
    initialSnapshot(storage, rundownId, online(), now()),
  );
  const active =
    snapshot.rundownId === rundownId
      ? snapshot
      : initialSnapshot(storage, rundownId, online(), now());
  const latestRef = useRef(active);
  latestRef.current = active;

  useEffect(() => {
    const start = initialSnapshot(storage, rundownId, online(), now());
    setSnapshot(start);
    latestRef.current = start;

    let closed = false;
    let handle: PrompterHandle | null = null;
    let unsubscribes: (() => void)[] = [];
    let savedRunOrder: readonly PrompterRow[] | null = null;
    let savedStories: ReadonlyMap<string, readonly BlockJSON[]> | null = null;
    let receivedLive = false;

    const flushCache = (): void => {
      if (!receivedLive) return;
      const cur = latestRef.current;
      if (cur.rundownId !== rundownId || !cur.hasFeed) return;
      persistFeed(
        storage,
        rundownId,
        cur.runOrder,
        cur.stories,
        cur.lastReceivedAt,
      );
    };

    const syncFromHandle = (current: PrompterHandle): void => {
      if (closed) return;
      const status = current.status.get();
      if (status.feed === "refused") {
        setSnapshot((prev) => ({
          ...prev,
          feed: "refused",
          hasFeed: false,
          runOrder: [],
          stories: EMPTY_STORIES,
        }));
        return;
      }
      if (status.feed === "live") {
        const nextRunOrder = current.runOrder.get();
        const nextStories = current.stories.get();
        const contentChanged =
          !receivedLive ||
          savedRunOrder !== nextRunOrder ||
          savedStories !== nextStories;
        receivedLive = true;
        if (contentChanged) {
          savedRunOrder = nextRunOrder;
          savedStories = nextStories;
          persistFeed(
            storage,
            rundownId,
            nextRunOrder,
            nextStories,
            status.lastReceivedAt,
          );
        }
        setSnapshot((prev) => ({
          ...prev,
          feed: "live",
          hasFeed: true,
          lastReceivedAt: status.lastReceivedAt ?? prev.lastReceivedAt,
          runOrder: nextRunOrder,
          stories: nextStories,
        }));
        return;
      }
      if (status.feed === "lost") {
        setSnapshot((prev) => {
          const lastReceivedAt = status.lastReceivedAt ?? prev.lastReceivedAt;
          if (receivedLive && prev.hasFeed)
            persistFeed(
              storage,
              rundownId,
              prev.runOrder,
              prev.stories,
              lastReceivedAt,
            );
          return { ...prev, feed: "lost", lastReceivedAt };
        });
        return;
      }
      setSnapshot((prev) => ({
        ...prev,
        feed: online() ? "waiting" : "lost",
        lastReceivedAt: status.lastReceivedAt ?? prev.lastReceivedAt,
      }));
    };

    const onOffline = (): void => {
      if (closed) return;
      setSnapshot((prev) =>
        prev.feed === "refused" ? prev : { ...prev, feed: "lost" },
      );
    };
    window.addEventListener("offline", onOffline);
    window.addEventListener("beforeunload", flushCache);

    void services.prompter(rundownId).then(
      (opened) => {
        if (closed) {
          opened.close();
          return;
        }
        handle = opened;
        unsubscribes = [
          opened.runOrder.subscribe(() => syncFromHandle(opened)),
          opened.stories.subscribe(() => syncFromHandle(opened)),
          opened.status.subscribe(() => syncFromHandle(opened)),
        ];
        syncFromHandle(opened);
      },
      () => {
        // sync could not start (e.g. offline): keep showing any cached feed under Feed lost
        if (closed) return;
        setSnapshot((prev) =>
          prev.feed === "refused" ? prev : { ...prev, feed: "lost" },
        );
      },
    );

    return () => {
      closed = true;
      flushCache();
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("beforeunload", flushCache);
      for (const stop of unsubscribes) stop();
      handle?.close();
    };
  }, [rundownId, services, storage, now, online]);

  const projected = useMemo(
    () => projectPrompterStories(active.runOrder, active.stories),
    [active.runOrder, active.stories],
  );

  return {
    feed: active.feed,
    lastReceivedAt: active.lastReceivedAt,
    hasFeed: active.hasFeed,
    loadingSinceMs: active.loadingSinceMs,
    stories: projected,
  };
}
