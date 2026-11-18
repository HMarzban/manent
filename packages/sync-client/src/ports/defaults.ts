// The client's numbers: reconnecting, waiting for answers, batching and the tab protocol.

/** A reconnect waits a random time below min(BACKOFF_CAP_MS, BACKOFF_BASE_MS * 2 ** attempt). */
export const BACKOFF_BASE_MS = 500;
export const BACKOFF_CAP_MS = 30_000;
/** Online this long, the link forgets its failures. */
export const STABLE_AFTER_MS = 10_000;
/** After a server restart, a reconnect waits a random time below this. */
export const RESTART_SPREAD_MS = 5_000;
/** A reconnect asked for at once waits a random time below this. */
export const RETRY_NOW_JITTER_MS = 1_000;

export const HEARTBEAT_MS = 15_000;
export const PONG_TIMEOUT_MS = 10_000;
/** The wait for the answer to a probe, sent when a reconnect is asked for while online. */
export const PROBE_TIMEOUT_MS = 1_500;
export const WELCOME_TIMEOUT_MS = 10_000;
/** The wait for each step of a subscription's handshake. */
export const HANDSHAKE_TIMEOUT_MS = 10_000;
/** The wait for the answer to the oldest push or setting in flight. */
export const ACK_TIMEOUT_MS = 30_000;
/** Remote updates are shown after this when no animation frame comes. */
export const FLUSH_FALLBACK_MS = 50;

/** The outbox's limits per push, and the pushes in flight at once. */
export const BATCH_BYTES = 1024 * 1024;
export const BATCH_ENTRIES = 1024;
export const IN_FLIGHT = 8;

/** Stored updates between two local checkpoints. */
export const LOCAL_CHECKPOINT_EVERY = 500;
/** Offline with edits waiting, a device version is kept at most this often. */
export const DEVICE_VERSION_INTERVAL_MS = 3_600_000;
/** A SUBSCRIBE lists the newest this many of the document's client IDs. */
export const SUBSCRIBE_CLIENT_IDS = 256;
/** Every message between tabs carries it; one with another version is ignored. */
export const TAB_PROTOCOL_VERSION = 1;
