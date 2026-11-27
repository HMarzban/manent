// The prompter window's words: feed status, controls, tooltips, loading, refusal and window title.
import { formatCount } from "./format.ts";

export const PROMPTER_WINDOW_WORDS = Object.freeze({
  live: "Live",
  feedLost: (time: string): string =>
    `Feed lost ${time} — showing last received`,
  feedLostNothing: "Feed lost — nothing received yet",
  nothingSent: "Nothing has been sent yet",
  nothingSentDetail: "Send a story from the rundown to show it here.",
  backToRundown: "Back to rundown",
  prompterLive: "Present on prompter · Live",
  prompterControlling: "Present on prompter · Controlling",
  prompterChanged: (n: number): string =>
    `Present on prompter · ${formatCount(n)} changed`,
  prompterWithStatus: (status: string): string =>
    `Present on prompter · ${status}`,
  linkRefused: "Link refused",
  linkRefusedDetail:
    "This prompter link needs access to the rundown. Ask its owner to share it with you.",
  opening: "Opening…",
  textSize: "Text size",
  textSizeValue: (px: number): string => `${px} px`,
  smallerText: "Smaller text",
  largerText: "Larger text",
  dark: "Dark",
  mirror: "Mirror",
  smallerUnavailable: "Smaller text — isn't available at 32 px",
  largerUnavailable: "Larger text — isn't available at 80 px",
  barLabel: "Prompter window",
  readingAreaLabel: "Prompter text",
  windowTitle: (show: string, date: string): string =>
    `Prompter · ${show} · ${date}`,
  windowTitleSingle: (title: string): string => `Prompter · ${title}`,
  popupBlocked:
    "Couldn't open the prompter window: the browser blocked it. Allow pop-ups for Manent, then try again.",
});
