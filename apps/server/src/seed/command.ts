// The seed command: `seed --phase foreground|background --data-dir <dir> --seed-at <epoch ms>`, run as a child process.

/** Seeds as `argv` says, starting with "seed"; resolves with the process's exit code. */
export async function runSeedCommand(
  _argv: readonly string[],
): Promise<number> {
  return 1;
}
