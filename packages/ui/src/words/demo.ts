// The demo bar's words. The server's words and "Chosen" are the web app's own.

export const DEMO_WORDS = {
  /** Shown in capitals by the stylesheet; also the bar region's accessible name. */
  demo: "Demo",
  person: (name: string): string => `Person: ${name}`,
  tour: "Tour",
} as const;
