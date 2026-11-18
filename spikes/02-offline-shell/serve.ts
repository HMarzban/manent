// Serves one build of the shell on 127.0.0.1 and records every request it receives.
import { join, normalize } from "node:path";

// The product's own servers use these ports.
function isReserved(port: number): boolean {
  return (port >= 4747 && port <= 4767) || port === 9999;
}

export function startServer(opts: { dir: string; port: number }): { port: number; stop(): void; requests(): string[] } {
  const received: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: opts.port,
    async fetch(request) {
      const { pathname } = new URL(request.url);
      received.push(`${request.method} ${pathname}`);
      if (pathname === "/api/ping") {
        return Response.json({ t: Date.now() }, { headers: { "cache-control": "no-store" } });
      }
      const file = Bun.file(join(opts.dir, normalize(pathname === "/" ? "/index.html" : pathname)));
      if (await file.exists()) {
        return new Response(file, pathname === "/sw.js" ? { headers: { "cache-control": "no-cache" } } : {});
      }
      if (request.headers.get("sec-fetch-mode") === "navigate" || request.headers.get("accept")?.includes("text/html")) {
        return new Response(Bun.file(join(opts.dir, "index.html")));
      }
      return new Response("not found", { status: 404 });
    },
  });
  return {
    port: server.port ?? opts.port,
    stop: () => void server.stop(true),
    requests: () => [...received],
  };
}

export function pickPort(): number {
  for (;;) {
    const probe = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: () => new Response() });
    const port = probe.port;
    void probe.stop(true);
    if (port !== undefined && !isReserved(port)) return port;
  }
}
