// The prompter window: top bar with feed state and view controls, and the scrollable reading area below.
import { DEMO_PEOPLE } from "@manent/demo";
import { PROMPTER_WINDOW_WORDS, useSubscribable } from "@manent/ui";
import type { SurfaceStateValue } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { focusHeading } from "../../../focus.ts";
import type { PrompterFollowMode } from "../../../prompter/remote-scroll.ts";
import { useEnvironment, useServices } from "../../../services/context.tsx";
import { pageTitle } from "../../../text.ts";
import { PrompterBar } from "./prompter-bar.tsx";
import type { PrompterBarStatus } from "./prompter-bar.tsx";
import { PrompterReading } from "./prompter-reading.tsx";
import { readPrompterView, writePrompterView } from "./prompter-storage.ts";
import type {
  PrompterTextSize,
  PrompterViewState,
} from "./prompter-storage.ts";
import { usePrompterFeed } from "./use-prompter-feed.ts";

const FRAME_AREA: CSSProperties = Object.freeze({
  gridColumn: "1 / -1",
  gridRow: "1 / -1",
});

function useProjectTitle(projectId: string | null): string | null {
  const { api, library, userId } = useServices();
  const [title, setTitle] = useState<string | null>(null);

  useEffect(() => {
    if (projectId === null) {
      setTitle(null);
      return;
    }
    let active = true;
    const stops: (() => void)[] = [];
    void api.me().then(
      (me) => {
        if (!active) return;
        const workspaces = me.ok ? me.me.workspaces.map(({ id }) => id) : [];
        for (const id of [...workspaces, userId]) {
          const listed = library.projects(id);
          const look = (): void => {
            const match = listed
              .get()
              .find((project) => project.projectId === projectId);
            if (match !== undefined) setTitle(match.title);
          };
          stops.push(listed.subscribe(look));
          look();
        }
      },
      () => {
        // server unreachable: fall back to the document's own title
      },
    );
    return () => {
      active = false;
      for (const stop of stops) stop();
    };
  }, [api, library, userId, projectId]);

  return title;
}

function usePrompterTitle(docId: string): string {
  const { library, userId } = useServices();
  const titleSource = useMemo(
    () => library.documentTitle(docId),
    [library, docId],
  );
  const projectSource = useMemo(
    () => library.documentProject(docId),
    [library, docId],
  );
  const docTitle = useSubscribable(titleSource);
  const projectId = useSubscribable(projectSource);
  const projectTitle = useProjectTitle(projectId);

  let heading: string;
  if (
    projectTitle !== null &&
    docTitle !== null &&
    !docTitle.startsWith(projectTitle)
  )
    heading = PROMPTER_WINDOW_WORDS.windowTitle(projectTitle, docTitle);
  else if (docTitle !== null)
    heading = PROMPTER_WINDOW_WORDS.windowTitleSingle(docTitle);
  else heading = PROMPTER_WINDOW_WORDS.barLabel;

  useEffect(() => {
    const person = DEMO_PEOPLE.find((p) => p.userId === userId);
    document.title = pageTitle(heading, person?.name ?? null);
  }, [heading, userId]);

  return heading;
}

/**
 * Mirrors the prompter window's own Dark choice onto the root element while mounted so built styles
 * whose light-dark() pairs resolve at :root match the nested dark scope without writing preferences.
 */
function useWindowScheme(dark: boolean): void {
  const { frame } = useEnvironment();
  useLayoutEffect(() => {
    const root = document.documentElement;
    const previous = root.getAttribute("data-theme");
    const target = dark ? "dark" : "light";
    let cancelFrame: (() => void) | null = null;
    const apply = (): void => {
      if (root.getAttribute("data-theme") === target) return;
      cancelFrame?.();
      root.setAttribute("data-switching", "");
      root.setAttribute("data-theme", target);
      cancelFrame = frame(() => {
        cancelFrame = null;
        root.removeAttribute("data-switching");
      });
    };
    apply();
    const observer = new MutationObserver(apply);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ["data-theme"],
    });
    return () => {
      observer.disconnect();
      cancelFrame?.();
      root.removeAttribute("data-switching");
      if (previous === null) root.removeAttribute("data-theme");
      else root.setAttribute("data-theme", previous);
    };
  }, [dark, frame]);
}

function derivePresentation(feed: ReturnType<typeof usePrompterFeed>): {
  barStatus: PrompterBarStatus;
  surfaceState: SurfaceStateValue;
} {
  if (feed.feed === "refused")
    return {
      barStatus: { kind: "refused" },
      surfaceState: { kind: "no_access" },
    };
  if (feed.feed === "lost")
    return {
      barStatus: { kind: "lost", lastReceivedAt: feed.lastReceivedAt },
      surfaceState:
        feed.stories.length > 0 ? { kind: "offline" } : { kind: "empty" },
    };
  if (feed.feed === "live")
    return feed.stories.length > 0
      ? { barStatus: { kind: "live" }, surfaceState: { kind: "ready" } }
      : {
          barStatus: { kind: "nothing_sent" },
          surfaceState: { kind: "empty" },
        };
  if (feed.hasFeed)
    return {
      barStatus: { kind: "loading" },
      surfaceState:
        feed.stories.length > 0 ? { kind: "ready" } : { kind: "empty" },
    };
  return {
    barStatus: { kind: "loading" },
    surfaceState: { kind: "loading", sinceMs: feed.loadingSinceMs },
  };
}

export function PrompterMode(props: { docId: string }): ReactNode {
  const { docId } = props;
  const navigate = useNavigate();
  const { storage, now, frame } = useEnvironment();
  const standalone = typeof window !== "undefined" && window.opener === null;
  const clock = useMemo(() => ({ now, frame }), [now, frame]);
  const [view, setView] = useState<PrompterViewState>(() =>
    readPrompterView(storage),
  );
  const [followMode, setFollowMode] = useState<PrompterFollowMode>("follow");
  const heading = usePrompterTitle(docId);
  const feed = usePrompterFeed(docId);
  useWindowScheme(view.dark);

  useEffect(() => {
    focusHeading(document);
  }, [docId]);

  const updateView = (patch: Partial<Omit<PrompterViewState, "v">>): void => {
    setView((prev) => {
      const next: PrompterViewState = { ...prev, ...patch };
      writePrompterView(storage, next);
      return next;
    });
  };

  const { barStatus, surfaceState } = derivePresentation(feed);
  const backToRundown = standalone
    ? () => void navigate({ href: `/s/${docId}` })
    : undefined;

  return (
    <div
      data-tour="prompter:window"
      data-theme={view.dark ? "dark" : "light"}
      className="z-10 flex h-dvh min-h-0 flex-col bg-desk text-fg"
      style={FRAME_AREA}
    >
      <h1 tabIndex={-1} className="sr-only">
        {heading}
      </h1>
      <PrompterBar
        status={barStatus}
        view={view}
        onBack={backToRundown}
        operator={feed.operator}
        scroll={feed.remoteScroll.state}
        followMode={followMode}
        onFollowModeChange={setFollowMode}
        onTextSizeChange={(textSize: PrompterTextSize) =>
          updateView({ textSize })
        }
        onDarkChange={(dark: boolean) => updateView({ dark })}
        onMirrorChange={(mirror: boolean) => updateView({ mirror })}
      />
      <PrompterReading
        surfaceState={surfaceState}
        stories={feed.stories}
        textSize={view.textSize}
        mirror={view.mirror}
        remoteScroll={feed.remoteScroll}
        followMode={followMode}
        onFollowModeChange={setFollowMode}
        onBack={backToRundown}
        clock={clock}
      />
    </div>
  );
}
