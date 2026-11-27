// A document and its Send screen: `/s/$docId` (`?at=<block id>` puts the caret there) and `/s/$docId/send/$form`.
import {
  createRoute,
  getRouteApi,
  lazyRouteComponent,
  redirect,
  stripSearchParams,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { Fragment, Suspense, createElement, lazy } from "react";
import type { ReactNode } from "react";
import { CloseBlocker, loadScreen } from "../router.tsx";
import { SEND_FORM_IDS, TEST_SEND_FORM_ID } from "../screens/send/form-ids.ts";
import { ScreenProblem } from "./screen-problem.ts";

// the build's define; absent outside a build
declare const MANENT_FLAVOUR: string | undefined;

const documentApi = getRouteApi("/s/$docId");

// it pulls in the editor's code, so it loads apart and never holds back the screen's first draw
const GoToAt = lazy(async () => ({
  default: (await import("../editor-host/go-to-at.tsx")).GoToAt,
}));

/** Follows `at` once the address names a block; draws nothing. */
function FollowAt(): ReactNode {
  const { at } = documentApi.useSearch();
  return typeof at === "string"
    ? createElement(Suspense, { fallback: null }, createElement(GoToAt))
    : null;
}

const DocumentScreen = lazyRouteComponent(
  loadScreen(async () => {
    const [{ DocumentScreen: Screen }, { CloseQuestion }] = await Promise.all([
      import("../screens/document/document-screen.tsx"),
      import("../services/sync/close-question.tsx"),
    ]);
    return {
      DocumentScreen: (): ReactNode =>
        createElement(
          Fragment,
          null,
          createElement(Screen),
          createElement(CloseBlocker),
          createElement(CloseQuestion),
          createElement(FollowAt),
        ),
    };
  }),
  "DocumentScreen",
);
const SendScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/send/send-screen.tsx")),
  "SendScreen",
);
const HistoryScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/history/history-screen.tsx")),
  "HistoryScreen",
);

export function documentRoutes(root: AnyRoute): readonly AnyRoute[] {
  // the test build also answers its own form's address
  const sendFormIds: readonly string[] =
    typeof MANENT_FLAVOUR !== "undefined" && MANENT_FLAVOUR === "test"
      ? [...SEND_FORM_IDS, TEST_SEND_FORM_ID]
      : SEND_FORM_IDS;
  const documentRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId",
    // the block the caret goes to once the editor is open; null when the address names none
    validateSearch: (
      search: Record<string, unknown>,
    ): { at: string | null } => ({
      at: typeof search.at === "string" ? search.at : null,
    }),
    // so an address never says at=null
    search: { middlewares: [stripSearchParams({ at: null })] },
    component: DocumentScreen,
    errorComponent: ScreenProblem,
  });

  const sendRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId/send/$form",
    beforeLoad: ({ params }) => {
      if (sendFormIds.includes(params.form)) return;
      throw redirect({
        to: "/s/$docId",
        params: { docId: params.docId },
        replace: true,
      });
    },
    component: SendScreen,
    errorComponent: ScreenProblem,
  });

  const historyRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId/history",
    component: HistoryScreen,
    errorComponent: ScreenProblem,
  });

  return [documentRoute, sendRoute, historyRoute];
}
