import { expect, test } from "bun:test";
import {
  createDemoDirectory,
  DEMO_PEOPLE,
  DEMO_WORKSPACES,
} from "../src/index.ts";

test("the six people, in the order the chooser lists them", () => {
  expect(DEMO_PEOPLE).toEqual([
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
});

test("the four workspaces and who is in them", () => {
  expect(DEMO_WORKSPACES).toEqual([
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
  expect(
    createDemoDirectory()
      .workspacesOf("dana")
      .map((w) => w.id),
  ).toEqual(["medium", "heavy"]);
});
