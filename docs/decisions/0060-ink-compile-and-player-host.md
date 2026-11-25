# 0060. Ink compiles and plays in one Web Worker with the compiler retained

- Date: 2026-11-25
- Status: Accepted
- Decided by: project owner and engineering lead

## Context

Game and interactive writers edit Ink scripts live while expecting instant syntax diagnostics, clickable problem links that jump to the exact source line, visited gutter marks and an interactive player Beside the script. Compiling Ink on the main UI thread risks blocking typing on large scripts, while stripping the compiler away from the runtime loses the source debug metadata needed for line links and runtime fault navigation.

## Options considered

- Compile and run Ink synchronously on the browser main thread. Rejected: large Ink stories can stall keystrokes and animation frames while compiling.
- Compile Ink on the server over HTTP and stream story steps back to the browser. Rejected: breaks offline editing and playing, and adds network round-trip latency to every choice and live edit.
- Host both `compileInk` and the live `InkStory` runtime inside one dedicated classic Web Worker precached by the service worker, retaining the compiler alongside the runtime so 1-based line numbers remain available. Chosen.

## Decision

Browser Ink compilation and live playback run inside one dedicated Web Worker (`apps/web/src/ink/compile.worker.ts`) driven by a 150 ms debounced client (`apps/web/src/ink/compile-client.ts`) with a single queued follow-up, retaining the `inkjs` compiler beside the story runtime so compilation problems, runtime faults and visited marks map directly to 1-based source line numbers; non-browser unit tests reuse the same handler in process.

## Consequences and trade-offs

- Typing stays smooth off the main thread, Ink editing and playing work fully offline, and clicking any problem or runtime fault jumps to the exact source line in the editor.
- Retaining the compiler in the worker makes the worker chunk larger than a runtime-only bundle, though it stays outside the app's entry and document-screen chunks (verified by `apps/web/test/build.test.ts`).
- Compile and replay timings on multi-thousand-line Ink scripts have not yet been measured in the benchmark suite.

## Revisit when

Very large Ink stories show worker memory pressure or compile pauses that require incremental compilation or a separate player worker.
