// Says something to a screen reader through the two live regions the shell keeps outside the editor.

export interface Announcer {
  announce(text: string, urgency?: "polite" | "assertive"): void;
}

const liveRegion = (
  region: HTMLElement,
  urgency: "polite" | "assertive",
): HTMLElement => {
  const live = region.querySelector(`[aria-live="${urgency}"]`);
  if (!(live instanceof HTMLElement)) {
    throw new TypeError(
      `an announcer's region holds no ${urgency} live region`,
    );
  }
  return live;
};

/** `region` holds a `[aria-live="polite"]` and a `[aria-live="assertive"]` element; throws a TypeError when one is missing. Polite by default. */
export function createAnnouncer(region: HTMLElement): Announcer {
  const live = {
    polite: liveRegion(region, "polite"),
    assertive: liveRegion(region, "assertive"),
  };
  return {
    announce(text, urgency = "polite") {
      // a new text node each time, so the same words are read again
      live[urgency].replaceChildren(text);
    },
  };
}
