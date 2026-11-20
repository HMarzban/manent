import { expect, test } from "bun:test";
import type { PresentPerson } from "@manent/editor";
import {
  announcementsFor,
  peopleAnnouncements,
} from "../src/editor-host/writing-announcer.ts";

const DANA: PresentPerson = { userId: "dana", name: "Dana Reyes", colour: 1 };
const SAM: PresentPerson = { userId: "sam", name: "Sam Okafor", colour: 2 };
const PRIYA: PresentPerson = { userId: "priya", name: "Priya Nair", colour: 3 };

test("an element change is said once, and a page start too unless the person chose elements only", () => {
  expect([
    announcementsFor(
      "elements_pages",
      { element: "Dialogue", page: "12" },
      { element: "Action", page: "13" },
    ),
    announcementsFor(
      "elements",
      { element: "Dialogue", page: "12" },
      { element: "Dialogue", page: "13" },
    ),
    announcementsFor(
      "elements_pages",
      { element: null, page: null },
      { element: "Scene Heading", page: "1" },
    ),
  ]).toEqual([["Action", "Page 13"], [], []]);
});

test("moving to a block of the same element on the same page says nothing", () => {
  expect(
    announcementsFor(
      "elements_pages_people",
      { element: "Action", page: "4" },
      { element: "Action", page: "4" },
    ),
  ).toEqual([]);
});

test("people arriving and leaving are said only when asked for", () => {
  expect([
    peopleAnnouncements("elements_pages_people", [DANA], [DANA, SAM]),
    peopleAnnouncements("elements_pages_people", [DANA, SAM], [SAM]),
    peopleAnnouncements("elements_pages", [], [SAM]),
  ]).toEqual([["Sam Okafor arrived"], ["Dana Reyes left"], []]);
});

test("several people arriving and leaving at once are said by name, the arrivals first", () => {
  expect(
    peopleAnnouncements("elements_pages_people", [SAM, DANA], [PRIYA]),
  ).toEqual(["Priya Nair arrived", "Dana Reyes left", "Sam Okafor left"]);
});
