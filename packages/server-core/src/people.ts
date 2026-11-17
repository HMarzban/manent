export type DemoPersonId = "dana" | "sam" | "priya" | "leo" | "ana" | "you";

export interface DemoPerson {
  id: DemoPersonId;
  name: string;
  role: string;
}

export type DemoWorkspaceId = "small" | "medium" | "heavy" | "you";

export interface DemoWorkspace {
  id: DemoWorkspaceId;
  name: string;
  members: readonly DemoPersonId[];
}

/** The people a tester can sign in as, in the order the chooser lists them. */
export const DEMO_PEOPLE: readonly DemoPerson[] = Object.freeze([
  { id: "dana", name: "Dana Reyes", role: "Showrunner, workspace owner" },
  { id: "sam", name: "Sam Okafor", role: "Staff writer, editor" },
  {
    id: "priya",
    name: "Priya Nair",
    role: "Script coordinator, editor with production permissions",
  },
  { id: "leo", name: "Leo Marsh", role: "Executive, reader and commenter" },
  { id: "ana", name: "Ana Costa", role: "News producer, editor of rundowns" },
  { id: "you", name: "You", role: "A new person with an empty workspace" },
]);

/** The seeded workspaces, in the order a member sees them. */
export const DEMO_WORKSPACES: readonly DemoWorkspace[] = Object.freeze([
  { id: "small", name: "Writer's desk", members: ["sam"] },
  {
    id: "medium",
    name: "Writers' room",
    members: ["dana", "sam", "priya", "leo", "ana"],
  },
  { id: "heavy", name: "Studio", members: ["dana", "priya"] },
  { id: "you", name: "Your workspace", members: ["you"] },
]);
