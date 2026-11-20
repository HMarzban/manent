// The demo's ports for an e2e run: MANENT_E2E_PORT moves them, so two worktrees can run the suite at once.

/** The demo's port, 4757 unless MANENT_E2E_PORT names another; RangeError for a value that is not a port. */
function portOf(value: string | undefined): number {
  if (value === undefined) return 4757;
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1024 || port > 65534)
    throw new RangeError(
      `MANENT_E2E_PORT must be a port from 1024 to 65534, not "${value}"`,
    );
  return port;
}

export const E2E_PORT = portOf(process.env.MANENT_E2E_PORT);
/** The demo's control port, the one after the demo's. */
export const E2E_CONTROL_PORT = E2E_PORT + 1;
