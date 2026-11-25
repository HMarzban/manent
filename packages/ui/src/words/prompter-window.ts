// The prompter window's words: feed status, controls, tooltips, loading, refusal and window title.

export const PROMPTER_WINDOW_WORDS = Object.freeze({
  live: "Live",
  feedLost: (time: string): string =>
    `Feed lost ${time} — showing last received`,
  feedLostNothing: "Feed lost — nothing received yet",
  nothingSent: "Nothing has been sent yet",
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
