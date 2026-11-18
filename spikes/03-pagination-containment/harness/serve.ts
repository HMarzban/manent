// bun harness/serve.ts
// Serves the editor page on a port the system picks, prints its base URL, and keeps running, for the checks made by
// hand. Stop it with Ctrl+C.
import { startServer } from './lib.ts'

if (import.meta.main) {
  const { base } = await startServer()
  console.log(base)
}
