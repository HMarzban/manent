// Watches the open script and its outline to drive the state bar and CommandContext.outlineStart.
import type { CrdtDoc } from "@manent/crdt";
import type { DocHandle } from "@manent/sync-client";
import { useSubscribable } from "@manent/ui";
import type { StateFact } from "@manent/ui";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  liveEditor,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { useServices } from "../services/context.tsx";
import { outlineStartActions } from "../state/outline-start.store.ts";
import { extractOutlineBeats, isDocEmpty } from "./beats.ts";
import { watchOutlineLink } from "./outline-link.ts";
import type { OutlineLinkState } from "./outline-link.ts";

const NO_FACTS: readonly StateFact[] = Object.freeze([]);

/** Subscribes to `doc`'s updates and handles a replaced document under `handle`. */
function watchHandleDoc(
  handle: DocHandle,
  onDoc: (doc: CrdtDoc) => void,
): () => void {
  let stopDoc = handle.doc().subscribe(() => onDoc(handle.doc()));
  onDoc(handle.doc());
  const stopReplaced = handle.on((event) => {
    if (event.type !== "replaced") return;
    stopDoc();
    stopDoc = handle.doc().subscribe(() => onDoc(handle.doc()));
    onDoc(handle.doc());
  });
  return () => {
    stopDoc();
    stopReplaced();
  };
}

/**
 * Returns the `outline_start` state-bar fact while `docId` is an editable empty script whose outline holds at least
 * one beat, and keeps `outlineStartActions` in sync for `CommandContext.outlineStart`.
 */
export function useOutlineStartFacts(docId: string): readonly StateFact[] {
  const services = useServices();
  const docKindSource = useMemo(
    () => services.library.docKindOf(docId),
    [services.library, docId],
  );
  const docKind = useSubscribable(docKindSource);
  const [beats, setBeats] = useState(0);
  const [scriptEmpty, setScriptEmpty] = useState(false);
  const [canEdit, setCanEdit] = useState(false);
  const [outlineDocId, setOutlineDocId] = useState<string | null>(null);
  const canEditRef = useRef(false);

  // Track write access from both the document's synced status and the server's role check.
  useEffect(() => {
    if (docKind !== null && docKind !== "script") {
      canEditRef.current = false;
      setCanEdit(false);
      return undefined;
    }
    let stopped = false;
    let serverRole: string | null | undefined = undefined;
    const doc = services.documents.open(docId);
    const compute = (): void => {
      if (stopped) return;
      const facts = doc.status.get();
      const statusOk =
        facts.access === "edit" && facts.server !== "access_removed";
      const roleOk = serverRole !== "view" && serverRole !== "comment";
      const next = statusOk && roleOk;
      canEditRef.current = next;
      setCanEdit(next);
    };
    compute();
    const stopStatus = doc.status.subscribe(compute);
    void services.api.role(docId).then((role) => {
      serverRole = role;
      compute();
    });
    return () => {
      stopped = true;
      stopStatus();
      services.documents.close(docId);
    };
  }, [services, docId, docKind]);

  // Watch the script's emptiness via the live editor (when mounted) and its handle.
  useEffect(() => {
    if (docKind !== null && docKind !== "script") {
      setScriptEmpty(false);
      return undefined;
    }
    let stopped = false;
    const stops: (() => void)[] = [];
    const read = (doc: CrdtDoc): void => {
      if (!stopped) setScriptEmpty(isDocEmpty(doc));
    };
    let stopLive = (): void => {};
    let watchedDoc: CrdtDoc | null = null;
    const followLive = (): void => {
      const doc = liveEditor(docId)?.doc ?? null;
      if (doc === watchedDoc) return;
      stopLive();
      watchedDoc = doc;
      if (doc !== null) {
        read(doc);
        stopLive = doc.subscribe(() => read(doc));
      } else {
        stopLive = (): void => {};
      }
    };
    followLive();
    stops.push(subscribeLiveEditors(followLive));
    void services
      .openHandle(docId)
      .then((handle) => {
        if (stopped) return;
        stops.push(watchHandleDoc(handle, read));
      })
      .catch(() => {
        // sync unavailable; live editor still reports emptiness when mounted
      });
    return () => {
      stopped = true;
      stopLive();
      for (const stop of stops) stop();
    };
  }, [services, docId, docKind]);

  // Watch the project/workspace index for this script's outline link.
  useEffect(() => {
    if (docKind !== null && docKind !== "script") {
      setOutlineDocId(null);
      return undefined;
    }
    return watchOutlineLink({
      services,
      scriptDocId: docId,
      canWrite: () => canEditRef.current,
      onChange: (link: OutlineLinkState) => setOutlineDocId(link.outlineDocId),
    });
  }, [services, docId, docKind, canEdit]);

  // Watch the outline document's beat count once linked.
  useEffect(() => {
    if (outlineDocId === null) {
      setBeats(0);
      return undefined;
    }
    let stopped = false;
    const stops: (() => void)[] = [];
    const read = (doc: CrdtDoc): void => {
      if (!stopped) setBeats(extractOutlineBeats(doc).length);
    };
    let stopLive = (): void => {};
    let watchedDoc: CrdtDoc | null = null;
    const followLive = (): void => {
      const doc = liveEditor(outlineDocId)?.doc ?? null;
      if (doc === watchedDoc) return;
      stopLive();
      watchedDoc = doc;
      if (doc !== null) {
        read(doc);
        stopLive = doc.subscribe(() => read(doc));
      } else {
        stopLive = (): void => {};
      }
    };
    followLive();
    stops.push(subscribeLiveEditors(followLive));
    void services
      .openHandle(outlineDocId)
      .then((handle) => {
        if (stopped) return;
        stops.push(watchHandleDoc(handle, read));
      })
      .catch(() => {
        // outline handle unavailable
      });
    return () => {
      stopped = true;
      stopLive();
      for (const stop of stops) stop();
    };
  }, [services, outlineDocId]);

  useEffect(() => {
    if (docKind !== null && docKind !== "script") {
      outlineStartActions.clear(docId);
      return;
    }
    outlineStartActions.set(docId, {
      outlineDocId,
      beats,
      scriptEmpty,
      canEdit,
    });
  }, [docId, docKind, outlineDocId, beats, scriptEmpty, canEdit]);

  useEffect(() => () => outlineStartActions.clear(docId), [docId]);

  return useMemo(
    () =>
      canEdit && scriptEmpty && outlineDocId !== null && beats > 0
        ? [{ kind: "outline_start", beats }]
        : NO_FACTS,
    [canEdit, scriptEmpty, outlineDocId, beats],
  );
}
