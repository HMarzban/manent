// Demo people and workspaces, the demo sign-in, the Tour and the seed.
export { DEMO_PEOPLE, DEMO_USER_IDS, DEMO_WORKSPACES } from "./people.ts";
export type { DemoPerson, DemoUserId, DemoWorkspace } from "./people.ts";
export { createDemoDirectory, createDemoSignIn } from "./sign-in.ts";
export { bindRefusal } from "./terminal.ts";
export {
  TOUR,
  TOUR_GROUPS,
  TOUR_ISSUE_CODES,
  validateTour,
} from "./tour/index.ts";
export type {
  TourFile,
  TourGroup,
  TourIssue,
  TourIssueCode,
  TourScenario,
  TourWindow,
} from "./tour/index.ts";
