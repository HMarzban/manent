// Words of remote prompter scroll control: operator lease, docked control bar, prompter follow mode and row jump.

export const PROMPTER_CONTROL_WORDS = Object.freeze({
  takeControl: "Take control",
  takingControl: "Taking control…",
  stopControlling: "Stop controlling",
  takeOver: "Take over",
  controlPrompter: "Control prompter",
  prompterReady: "Prompter ready",
  controlsPrompter: (name: string): string => `${name} controls the prompter`,
  alreadyControlsPrompter: (name: string): string =>
    `${name} already controls the prompter.`,
  play: "Play",
  pause: "Pause",
  scrollRate: "Scroll rate",
  slow: "Slow",
  normal: "Normal",
  fast: "Fast",
  backLine: "Back a line",
  forwardLine: "Forward a line",
  jumpHere: "Jump prompter here",
  jumpHereUnavailable:
    "Jump prompter here — this row has nothing on the prompter",
  follow: "Follow",
  freeScroll: "Free scroll",
  feedLostPaused: (time: string): string =>
    `Feed lost ${time} — scrolling paused`,
  offlinePaused: "Offline — scrolling paused",
  linesPerSecond: (n: number): string => `${n} l/s`,
  playingAt: (n: number): string => `Playing · ${n} l/s`,
  paused: "Paused",
});
