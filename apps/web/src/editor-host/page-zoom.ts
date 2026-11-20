// The open page following the zoom: each change of it reaches the page, and a pinch on the page changes it.
import type { Frames, ScriptEditor, Timers } from "@manent/editor";
import { shellAnnouncer } from "../shell/announcer-region.tsx";
import { zoomActions } from "../state/zoom.store.ts";
import { pinchZoom, zoomAnnouncement } from "./zoom.ts";

/** A pinch is said once it has rested this long. */
const PINCH_SAID_MS = 150;

const noop = (): void => {};

/**
 * Sets `editor`'s zoom on every change of the zoom, and makes a pinch over `element` (a wheel event with the Control key,
 * as browsers deliver a trackpad pinch) zoom the page instead of the browser, at most once per frame, saying the zoom
 * reached once the pinch has rested 150 ms. A page without pages (Ink) follows nothing. Returns the disposer.
 */
export function followZoom(options: {
  editor: Pick<ScriptEditor, "scaffold" | "setZoom" | "zoomPercent">;
  element: HTMLElement;
  frames: Frames;
  timers: Timers;
}): () => void {
  const { editor, element, frames, timers } = options;
  if (editor.scaffold === null) return noop;
  const stopFollowing = zoomActions.subscribe(() =>
    editor.setZoom(zoomActions.get()),
  );
  // the wheel distance of every event since the last frame
  let deltaY = 0;
  let framed = false;
  let cancelFrame = noop;
  let cancelSaying = noop;
  const zoomInFrame = (): void => {
    framed = false;
    const drawn = editor.zoomPercent();
    const distance = deltaY;
    deltaY = 0;
    if (drawn !== null) zoomActions.set(pinchZoom(drawn, distance));
  };
  const onWheel = (event: WheelEvent): void => {
    if (!event.ctrlKey) return;
    event.preventDefault();
    deltaY += event.deltaY;
    if (!framed) {
      framed = true;
      cancelFrame = frames.request(zoomInFrame);
    }
    cancelSaying();
    cancelSaying = timers.schedule(() => {
      cancelSaying = noop;
      shellAnnouncer(element.ownerDocument).announce(
        zoomAnnouncement(zoomActions.get()),
      );
    }, PINCH_SAID_MS);
  };
  // not passive, so that the browser's own zoom can be prevented
  element.addEventListener("wheel", onWheel, { passive: false });
  return () => {
    element.removeEventListener("wheel", onWheel);
    stopFollowing();
    cancelFrame();
    cancelSaying();
  };
}
