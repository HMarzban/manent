// Words for Script settings' layout rows (Lines per page, Scene numbers, Layout engine).
import { formatCount } from "./format.ts";

export const LAYOUT_SETTINGS_WORDS = Object.freeze({
  formatFigure: (lines: number): string =>
    `${formatCount(lines)} (the format's figure)`,
  theFormatsFigure: "the format's figure",
  paperHoldsAtMost: (paper: string, max: number): string =>
    `${paper} holds at most ${formatCount(max)} lines, so pages use ${formatCount(max)}.`,
  linesRangeError: (max: number): string =>
    `Lines per page is a whole number from 10 to ${formatCount(max)}.`,
  lockedSceneNumbersNote:
    "Page numbers are locked, so scene numbers always show: None reads as Left and right.",
  multicamSceneNumbersNote:
    "A multi-camera script letters its scenes on both sides.",
  engineLine: (version: number): string =>
    `Layout engine ${formatCount(version)}`,
  engineAvailable: (version: number, before: number, after: number): string =>
    `Layout engine ${formatCount(version)} is available · ${formatCount(before)} → ${formatCount(after)} pages`,
  engineCounting: (version: number): string =>
    `Layout engine ${formatCount(version)} is available · counting pages…`,
  updateEngine: "Update layout engine",
  updateRefused: "Couldn't update the layout engine. Try again.",
  sceneNumbersNow: (valueLabel: string): string =>
    `Scene numbers are now ${valueLabel}.`,
  undo: "Undo",
});
