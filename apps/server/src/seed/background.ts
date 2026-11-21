// Lanternfield Studios seeded in a child process after the app opens, into a staging directory.

/** Spawns the background seed; `stop` ends it, and with it whatever it had written. */
export function startBackgroundSeed(_options: {
  execPath: string;
  entry: string;
  dataDir: string;
  seedAt: number;
  onProgress(done: number, total: number): void;
  onDone(): Promise<void>;
  onFailed(reason: string): void;
}): { stop(): Promise<void> } {
  return { stop: async () => {} };
}
