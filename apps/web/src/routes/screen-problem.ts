// What every route draws when its screen cannot be drawn.
import { lazyRouteComponent } from "@tanstack/react-router";

// apart from the entry, whose size budget its stock button would break
export const ScreenProblem = lazyRouteComponent(
  () => import("../shell/screen-problem.tsx"),
  "ScreenProblem",
);
