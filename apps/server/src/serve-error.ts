// What a request whose handler threw is answered with.

/**
 * The answer to a request whose handler threw: a plain sentence, with nothing of the thrown value
 * on the page or in the log, since it may name files and lines of this machine.
 */
export function onServeError(_error: unknown): Response {
  console.error("A request could not be answered.");
  return new Response("Manent could not answer that request.", {
    status: 500,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
