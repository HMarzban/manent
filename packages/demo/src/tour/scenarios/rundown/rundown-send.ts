import type { TourScenario } from "../../format.ts";
import { docPath } from "../../../seed/catalogue.ts";
import { setupOf } from "../setup.ts";

export const RUNDOWN_SEND: TourScenario = {
  id: "rundown-send",
  group: "Rundown and prompter",
  promise:
    "A story changed after it was sent says so, and one Send puts it right.",
  setup: setupOf(
    {
      userId: "ana",
      open: docPath("medium/lannick-one-news/rundowns/day"),
    },
    [],
    "news-story-01-changed",
  ),
  steps: [
    {
      text: "Row 1, story 01, reads Changed — not on prompter: the vote count was corrected after it was sent.",
      highlight: "rundown:prompter_column",
    },
    {
      text: "The newscast is in its air window, so nothing reaches the prompter until someone sends it.",
      highlight: "state_bar",
    },
    {
      text: "Choose Send to prompter on row 1.",
      highlight: "prompter.send",
    },
    {
      text: "Choose Present on prompter in View: story 01 now reads thirty-one votes to eight.",
      highlight: "view.presentOnPrompter",
    },
  ],
  check:
    'Row 1 reads "Changed — not on prompter" and the state bar "In the air window — prompter text changes only when you send it."; after Send the row reads "On prompter", and the prompter window shows "thirty-one votes to eight".',
  evidence: [
    "Changed — not on prompter",
    "In the air window — prompter text changes only when you send it.",
    "On prompter",
    "thirty-one votes to eight",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
