// The demo's people and the workspaces they belong to.
import type { SignInChoice } from "@manent/sync-protocol";

export const DEMO_USER_IDS = [
  "dana",
  "sam",
  "priya",
  "leo",
  "ana",
  "you",
] as const;

export type DemoUserId = (typeof DEMO_USER_IDS)[number];

export interface DemoPerson extends SignInChoice {
  userId: DemoUserId;
}

/** The people a tester can sign in as, in the order the chooser lists them. */
export const DEMO_PEOPLE: readonly DemoPerson[] = Object.freeze([
  {
    userId: "dana",
    name: "Dana Reyes",
    title: "Showrunner, workspace owner",
    registered: true,
  },
  {
    userId: "sam",
    name: "Sam Okafor",
    title: "Staff writer, editor",
    registered: true,
  },
  {
    userId: "priya",
    name: "Priya Nair",
    title: "Script coordinator, editor with production permissions",
    registered: true,
  },
  {
    userId: "leo",
    name: "Leo Marsh",
    title: "Executive, reader and commenter",
    registered: true,
  },
  {
    userId: "ana",
    name: "Ana Costa",
    title: "News producer, editor of rundowns",
    registered: true,
  },
  {
    userId: "you",
    name: "You",
    title: "A new person with an empty workspace",
    registered: false,
  },
]);

export interface DemoWorkspace {
  id: "small" | "medium" | "heavy" | "you";
  name: string;
  memberUserIds: readonly DemoUserId[];
}

/** The seeded workspaces, in the order a member sees them. */
export const DEMO_WORKSPACES: readonly DemoWorkspace[] = Object.freeze([
  { id: "small", name: "Sam's desk", memberUserIds: ["sam"] },
  {
    id: "medium",
    name: "Writers' room",
    memberUserIds: ["dana", "sam", "priya", "leo", "ana"],
  },
  {
    id: "heavy",
    name: "Lanternfield Studios",
    memberUserIds: ["dana", "priya"],
  },
  { id: "you", name: "Your desk", memberUserIds: ["you"] },
]);
