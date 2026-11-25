// The reader route `/r/$token`: a direct child of the root route that opens with or without a person chosen.
import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { createElement, useMemo } from "react";
import { loadScreen } from "../router.tsx";
import type { AppRouterDeps } from "./index.ts";
import { ScreenProblem } from "./screen-problem.ts";

const ReaderScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/reader/reader-screen.tsx")),
  "ReaderScreen",
);

const PREFETCH_TTL_MS = 5_000;

interface PrefetchedOpen {
  readonly key: string;
  readonly startedAt: number;
  readonly response: Promise<Response>;
}

const openKey = (linkToken: string, bearer: string | null): string =>
  `${bearer ?? ""}\0${linkToken}`;

function readAuthHeader(headers: HeadersInit | undefined): string | null {
  if (headers === undefined) return null;
  if (headers instanceof Headers) return headers.get("Authorization");
  if (Array.isArray(headers)) {
    const found = headers.find(([k]) => k.toLowerCase() === "authorization");
    return found?.[1] ?? null;
  }
  const value = headers.Authorization ?? headers.authorization;
  return typeof value === "string" ? value : null;
}

/** Starts `POST /api/drafts/open` in the route loader so the draft arrives in parallel with the Reader chunk. */
function createPrefetchFetch(
  baseFetch: typeof fetch,
  consume: (key: string) => Promise<Response> | null,
): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    if (
      input === "/api/drafts/open" &&
      init?.method === "POST" &&
      typeof init.body === "string"
    ) {
      try {
        const parsed: unknown = JSON.parse(init.body);
        const linkToken =
          typeof parsed === "object" &&
          parsed !== null &&
          "token" in parsed &&
          typeof parsed.token === "string"
            ? parsed.token
            : null;
        if (linkToken !== null) {
          const auth = readAuthHeader(init.headers);
          const bearer =
            auth !== null && auth.startsWith("Bearer ") ? auth.slice(7) : null;
          const hit = consume(openKey(linkToken, bearer));
          if (hit !== null) return hit;
        }
      } catch {
        // non-JSON body: fall through to base fetch
      }
    }
    return baseFetch(input, init);
  }) as typeof fetch;
}

export function readerRoutes(
  root: AnyRoute,
  deps: AppRouterDeps,
): readonly AnyRoute[] {
  let prefetched: PrefetchedOpen | null = null;
  const isFresh = (entry: PrefetchedOpen | null, key: string): boolean =>
    entry !== null &&
    entry.key === key &&
    Date.now() - entry.startedAt <= PREFETCH_TTL_MS;
  const consume = (key: string): Promise<Response> | null => {
    const entry = prefetched;
    prefetched = null;
    return isFresh(entry, key) ? entry!.response : null;
  };
  const readerRoute = createRoute({
    getParentRoute: () => root,
    path: "/r/$token",
    loader: ({ params }) => {
      const linkToken = params.token;
      const bearer = deps.usePerson.getState().person?.token ?? null;
      const key = openKey(linkToken, bearer);
      if (isFresh(prefetched, key)) return;
      const fetchFn = deps.fetch;
      const response = fetchFn("/api/drafts/open", {
        method: "POST",
        headers: {
          ...(bearer === null ? {} : { Authorization: `Bearer ${bearer}` }),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ token: linkToken }),
      });
      const entry: PrefetchedOpen = { key, startedAt: Date.now(), response };
      prefetched = entry;
      // drop non-ok or rejected responses so they are never reused, and prevent unhandled rejections
      void response.then(
        (res) => {
          if (!res.ok && prefetched === entry) prefetched = null;
        },
        () => {
          if (prefetched === entry) prefetched = null;
        },
      );
    },
    component: function Reader() {
      const { token } = readerRoute.useParams();
      const wrappedFetch = useMemo(
        () => createPrefetchFetch(deps.fetch, consume),
        [],
      );
      return createElement(ReaderScreen, {
        token,
        api: deps.api,
        fetch: wrappedFetch,
        usePerson: deps.usePerson,
      });
    },
    errorComponent: ScreenProblem,
  });
  return [readerRoute];
}
