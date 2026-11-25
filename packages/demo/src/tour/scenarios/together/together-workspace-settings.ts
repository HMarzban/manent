import type { TourScenario } from "../../format.ts";
import { setupOf } from "../setup.ts";

export const TOGETHER_WORKSPACE_SETTINGS: TourScenario = {
  id: "together-workspace-settings",
  group: "Work together",
  promise:
    "Run a workspace's people from one place, and everyone sees the rules.",
  setup: setupOf({ userId: "dana", open: "/" }, [{ userId: "sam", open: "/" }]),
  steps: [
    {
      text: "Open the workspace switcher and choose Workspace settings.",
      highlight: "workspace:settings",
    },
    {
      text: "In People, set Leo Marsh to Can view.",
      highlight: "workspace:people",
    },
    {
      text: "In Sam's window, open Workspace settings: he sees the same people and cannot change them.",
      highlight: "workspace:settings",
    },
  ],
  check:
    'The screen reads "Rules for everyone in this workspace."; Dana\'s message reads "Leo\'s role in Writers\' room is now Can view."; Sam\'s window reads "Only owners can change workspace settings."',
  evidence: [
    "Rules for everyone in this workspace.",
    "Leo's role in Writers' room is now Can view.",
    "Only owners can change workspace settings.",
  ],
  fresh: true,
  waitsFor: null,
  hidden: null,
};
