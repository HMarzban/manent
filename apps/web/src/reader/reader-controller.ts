// Connects the `history.sinceLastRead` command handler to whichever reader screen is mounted.

let activeSinceLastRead: (() => void) | null = null;

/** Registers the mounted reader screen's `Changes since you last read` action; returns the unregister. */
export function registerReaderSinceLastRead(run: () => void): () => void {
  activeSinceLastRead = run;
  return () => {
    if (activeSinceLastRead === run) activeSinceLastRead = null;
  };
}

/** Runs `Changes since you last read` on the active reader screen, if one is mounted. */
export function runReaderSinceLastRead(): void {
  activeSinceLastRead?.();
}
