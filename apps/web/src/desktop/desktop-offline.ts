// Live cloud reachability for the desktop window titlebar: polls /api/local/status once, then follows SSE and browser events.
import { useEffect, useState } from "react";
import type { DesktopHost } from "./host.ts";

async function readStatusOnline(response: Response): Promise<boolean | null> {
  if (!response.ok) return null;
  const body: unknown = await response.json();
  if (typeof body !== "object" || body === null || !("online" in body))
    return null;
  return typeof body.online === "boolean" ? body.online : null;
}

/** Asks the local desktop node to probe cloud reachability immediately; null when unavailable. */
export async function probeDesktopCloudStatus(
  signal?: AbortSignal,
): Promise<boolean | null> {
  if (typeof fetch !== "function") return null;
  try {
    const response = await fetch("/api/local/status?probe=1", {
      method: "GET",
      signal,
    });
    return await readStatusOnline(response);
  } catch {
    return null;
  }
}

/**
 * Whether the desktop app's cloud link is currently reachable.
 * Defaults to `true` until `/api/local/status`, a `cloud_state` shell message, or `navigator.onLine` says offline.
 */
export function useDesktopCloudOnline(desktop: DesktopHost | null): boolean {
  const [cloudOnline, setCloudOnline] = useState(true);
  const [browserOnline, setBrowserOnline] = useState(() =>
    typeof navigator === "undefined" ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    if (desktop === null) {
      setCloudOnline(true);
      return;
    }

    let cancelled = false;
    let receivedLive = false;
    const controller = new AbortController();

    const stopMessages = desktop.onMessage((message) => {
      if (message.t !== "cloud_state") return;
      receivedLive = true;
      setCloudOnline(message.online);
    });

    const probeStatus = (probe: boolean): void => {
      if (typeof fetch !== "function") return;
      void fetch(probe ? "/api/local/status?probe=1" : "/api/local/status", {
        method: "GET",
        signal: controller.signal,
      })
        .then(readStatusOnline)
        .then((online) => {
          if (cancelled || online === null) return;
          if (!probe && receivedLive) return;
          setCloudOnline(online);
        })
        .catch(() => {
          // A node without /api/local/status or a transient network drop leaves the current state alone.
        });
    };

    const onBrowserOnline = (): void => {
      setBrowserOnline(true);
      probeStatus(true);
    };
    const onBrowserOffline = (): void => setBrowserOnline(false);

    if (typeof navigator !== "undefined") {
      setBrowserOnline(navigator.onLine !== false);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", onBrowserOnline);
      window.addEventListener("offline", onBrowserOffline);
    }

    probeStatus(false);

    return () => {
      cancelled = true;
      controller.abort();
      stopMessages();
      if (typeof window !== "undefined") {
        window.removeEventListener("online", onBrowserOnline);
        window.removeEventListener("offline", onBrowserOffline);
      }
    };
  }, [desktop]);

  return desktop === null ? true : cloudOnline && browserOnline;
}
