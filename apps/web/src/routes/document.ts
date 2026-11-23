// A document and its Send screen: `/s/$docId` and `/s/$docId/send/$form`.
import {
  createRoute,
  lazyRouteComponent,
  redirect,
} from "@tanstack/react-router";
import type { AnyRoute } from "@tanstack/react-router";
import { Fragment, createElement } from "react";
import type { ReactNode } from "react";
import { CloseBlocker, loadScreen } from "../router.tsx";
import { SEND_FORM_IDS } from "../screens/send/form-ids.ts";
import { ScreenProblem } from "./screen-problem.ts";

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
        ),
    };
  }),
  "DocumentScreen",
);
const SendScreen = lazyRouteComponent(
  loadScreen(() => import("../screens/send/send-screen.tsx")),
  "SendScreen",
);

export function documentRoutes(root: AnyRoute): readonly AnyRoute[] {
  const documentRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId",
    component: DocumentScreen,
    errorComponent: ScreenProblem,
  });

  const sendRoute = createRoute({
    getParentRoute: () => root,
    path: "/s/$docId/send/$form",
    beforeLoad: ({ params }) => {
      if (SEND_FORM_IDS.some((id) => id === params.form)) return;
      throw redirect({
        to: "/s/$docId",
        params: { docId: params.docId },
        replace: true,
      });
    },
    component: SendScreen,
    errorComponent: ScreenProblem,
  });

  return [documentRoute, sendRoute];
}
