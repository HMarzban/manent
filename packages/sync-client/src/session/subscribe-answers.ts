// Which of the SUBSCRIBEs sent on one connection an answer is for: the server answers them in
// order, so an answer is the current subscription's only when no later SUBSCRIBE is unanswered.

/**
 * An answer is SUBSCRIBED, GENERATION_MOVED or an ERROR naming no entry. One
 * that comes when no SUBSCRIBE waits is taken as the current subscription's.
 */
export class SubscribeAnswers {
  private unanswered = 0;

  /** A new connection: nothing sent on it waits for an answer. */
  reset(): void {
    this.unanswered = 0;
  }

  asked(): void {
    this.unanswered += 1;
  }

  /** Counts an answer, and says whether it answers the last SUBSCRIBE sent. */
  take(): "current" | "superseded" {
    if (this.unanswered === 0) return "current";
    this.unanswered -= 1;
    return this.unanswered > 0 ? "superseded" : "current";
  }
}
