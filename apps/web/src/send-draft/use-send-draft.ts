// State controller hook for SendDraftForm: defaults, per-group recall, comparison, watermark lock and submit.
import type { Pagination } from "@manent/pagination";
import { DRAFTS_WORDS, LIBRARY_WORDS, useSubscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import {
  liveEditor,
  livePagination,
  subscribeLiveEditors,
} from "../editor-host/live-editor.ts";
import { useDraftLadder } from "../screens/document/draft-name.tsx";
import { typesOffered } from "../send/file-types.ts";
import { useEnvironment, useServices } from "../services/context.tsx";
import { readPerson, tabStorage } from "../session.ts";
import { useProjectGroups, useWorkspacePeople } from "./access.ts";
import type { DraftSendAccess } from "./access.ts";
import {
  computeChangedLines,
  countScenes,
  selectPageIndexes,
} from "./draft-output.ts";
import type { WhatSelection } from "./draft-output.ts";
import {
  baselinesOf,
  distinctRecipientCount,
  proposedDraftName,
  recallGroupChoices,
  submitSendDraft,
} from "./draft-state.ts";
import { useDraftSends } from "./sends.ts";

const NO_SUBSCRIBE = (): (() => void) => () => {};

function useMultiCamera(docId: string): boolean {
  const { openScriptStore } = useServices();
  const store = useMemo(
    () => (docId ? openScriptStore(docId) : null),
    [openScriptStore, docId],
  );
  const subscribe = useCallback(
    (listener: () => void) =>
      store === null
        ? NO_SUBSCRIBE()
        : store.subscribe("project.template", listener),
    [store],
  );
  return useSyncExternalStore(
    subscribe,
    () => store !== null && store.get("project.template") === "multi_camera",
  );
}

function useLivePages(docId: string): Pagination | null {
  const editor = useSyncExternalStore(subscribeLiveEditors, () =>
    liveEditor(docId),
  );
  return useMemo(
    () => (editor === null ? null : livePagination(docId)),
    [editor, docId],
  );
}

export function useSendDraft(docId: string, access: DraftSendAccess) {
  const services = useServices();
  const env = useEnvironment();
  const navigate = useNavigate();

  const p = useLivePages(docId);
  const pageCount = p?.pages.length ?? 1;
  const sceneCount = p === null ? 1 : Math.max(1, countScenes(p));
  const title =
    useSubscribable(services.library.documentTitle(docId)) ??
    LIBRARY_WORDS.untitledScript;
  const historySource = useMemo(
    () => services.history.rows(docId),
    [services.history, docId],
  );
  const historyView = useSubscribable(historySource);
  const sendsState = useDraftSends(docId, access.ready);
  const multiCamera = useMultiCamera(docId);
  const ladder = useDraftLadder(docId);
  const groups = useProjectGroups(docId);
  const people = useWorkspacePeople(services.userId);
  const offeredTypes = typesOffered("send_draft", access.offered);

  const baselines = useMemo(
    () => baselinesOf(sendsState.sends, historyView.rows),
    [sendsState.sends, historyView.rows],
  );
  const proposedName = useMemo(
    () => proposedDraftName(sendsState.sends, historyView.rows, ladder),
    [sendsState.sends, historyView.rows, ladder],
  );

  const [name, setName] = useState(proposedName);
  const [nameEdited, setNameEdited] = useState(false);
  useEffect(() => {
    if (!nameEdited) setName(proposedName);
  }, [nameEdited, proposedName]);

  const [what, setWhat] = useState<WhatSelection>(() => ({
    id: multiCamera ? "full_draft" : "whole_script",
    firstPage: 1,
    lastPage: pageCount,
    firstScene: 1,
    lastScene: sceneCount,
  }));
  const [whatEdited, setWhatEdited] = useState(false);
  useEffect(() => {
    if (whatEdited) return;
    setWhat((prev) => ({
      ...prev,
      id: multiCamera ? "full_draft" : "whole_script",
      lastPage: pageCount,
      lastScene: sceneCount,
    }));
  }, [multiCamera, whatEdited, pageCount, sceneCount]);

  const [selectedFiles, setSelectedFiles] = useState<readonly string[]>(() => [
    "pdf",
  ]);
  const [filesEdited, setFilesEdited] = useState(false);
  const [againstVersionId, setAgainstVersionId] = useState<string | null>(null);
  const [watermark, setWatermark] = useState(false);

  const [selectedGroupIds, setSelectedGroupIds] = useState<readonly string[]>(
    [],
  );
  const [selectedPeopleIds, setSelectedPeopleIds] = useState<readonly string[]>(
    [],
  );
  const [linkEnabled, setLinkEnabled] = useState(true);
  const [linkTouched, setLinkTouched] = useState(false);
  const [expiryIndex, setExpiryIndex] = useState(0);
  const [askWhoTheyAre, setAskWhoTheyAre] = useState(false);

  const lastSentBaseline = baselines[0] ?? null;
  const activeAgainstId = againstVersionId ?? lastSentBaseline?.id ?? null;

  useEffect(() => {
    if (!filesEdited && multiCamera && lastSentBaseline !== null)
      setSelectedFiles(["pdf_asterisks"]);
  }, [filesEdited, multiCamera, lastSentBaseline]);

  const needsChangedLines =
    selectedFiles.includes("pdf_asterisks") ||
    (multiCamera && lastSentBaseline !== null);
  const [changedState, setChangedState] = useState<{
    docId: string;
    versionId: string;
    lines: ReadonlyMap<string, readonly number[]> | null;
  } | null>(null);

  useEffect(() => {
    if (!needsChangedLines || activeAgainstId === null || p === null) return;
    let current = true;
    void computeChangedLines(services.history, docId, activeAgainstId, p).then(
      (lines) => {
        if (current)
          setChangedState({ docId, versionId: activeAgainstId, lines });
      },
    );
    return () => {
      current = false;
    };
  }, [services.history, docId, needsChangedLines, activeAgainstId, p]);

  const changedLines =
    needsChangedLines &&
    changedState !== null &&
    changedState.docId === docId &&
    changedState.versionId === activeAgainstId
      ? changedState.lines
      : null;

  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const submitKeyRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const distinctCount = useMemo(
    () => distinctRecipientCount(selectedGroupIds, selectedPeopleIds, groups),
    [selectedGroupIds, selectedPeopleIds, groups],
  );

  // Any watermarked group locks watermarking on so no recipient or downloaded copy bypasses group policy.
  const watermarkLocked = useMemo(
    () =>
      selectedGroupIds.some(
        (id) => groups.find((group) => group.id === id)?.watermark === true,
      ),
    [selectedGroupIds, groups],
  );
  const watermarkRequired = watermark || watermarkLocked;

  const nobody =
    selectedGroupIds.length === 0 &&
    selectedPeopleIds.length === 0 &&
    !linkEnabled;

  const addGroup = (groupId: string): void => {
    if (selectedGroupIds.includes(groupId)) return;
    const hadNone =
      selectedGroupIds.length === 0 && selectedPeopleIds.length === 0;
    const next = [...selectedGroupIds, groupId];
    setSelectedGroupIds(next);
    if (hadNone && !linkTouched) setLinkEnabled(false);
    if (next.length !== 1) return;
    const recalled = recallGroupChoices({
      sends: sendsState.sends,
      firstGroupId: groupId,
      offeredTypes,
      baselines,
      pageCount,
      sceneCount,
    });
    if (recalled === null) return;
    if (recalled.files !== null) {
      setSelectedFiles(recalled.files);
      setFilesEdited(true);
    }
    setWhat(recalled.what);
    setWhatEdited(true);
    if (recalled.againstVersionId !== null)
      setAgainstVersionId(recalled.againstVersionId);
  };

  const addPerson = (userId: string): void => {
    if (selectedPeopleIds.includes(userId)) return;
    const hadNone =
      selectedGroupIds.length === 0 && selectedPeopleIds.length === 0;
    setSelectedPeopleIds([...selectedPeopleIds, userId]);
    if (hadNone && !linkTouched) setLinkEnabled(false);
  };

  const toggleFile = (fileId: string, on: boolean): void => {
    setFilesEdited(true);
    setSelectedFiles((current) => {
      if (on) return current.includes(fileId) ? current : [...current, fileId];
      const next = current.filter((id) => id !== fileId);
      return next.length === 0 ? current : next;
    });
  };

  const pageIndexes = useMemo(
    () => (p === null ? [] : selectPageIndexes(docId, p, what, changedLines)),
    [docId, p, what, changedLines],
  );
  const previewWatermark = watermarkRequired
    ? (readPerson(tabStorage())?.name ?? null)
    : null;

  const trimmedName = name.trim();
  const actionLabel = DRAFTS_WORDS.sendAction(distinctCount);
  const busyLabel = DRAFTS_WORDS.sendingAction(distinctCount);
  const disabledReason = !access.online
    ? DRAFTS_WORDS.needsConnection
    : trimmedName === ""
      ? DRAFTS_WORDS.needsName
      : null;

  const runSend = async (): Promise<void> => {
    if (busy || disabledReason !== null || p === null) return;
    const key = submitKeyRef.current ?? env.randomId().replaceAll("-", "");
    submitKeyRef.current = key;
    setBusy(true);
    setProblem(null);

    const outcome = await submitSendDraft({
      services,
      now: env.now,
      docId,
      key,
      title,
      name: trimmedName,
      multiCamera,
      what,
      selectedFiles,
      offeredTypes,
      selectedGroupIds,
      selectedPeopleIds,
      needsChangedLines,
      activeAgainstId,
      watermarkRequired,
      watermarkName: previewWatermark,
      linkEnabled,
      expiryIndex,
      askWhoTheyAre,
      pagination: p,
      pageIndexes,
      changedLines,
    });
    if (!mountedRef.current) return;
    if (!outcome.ok) {
      setBusy(false);
      setProblem(DRAFTS_WORDS.sendFailed(trimmedName));
      return;
    }
    submitKeyRef.current = null;
    services.messages.push(outcome.message);
    void navigate({ to: "/s/$docId", params: { docId }, replace: true });
  };

  return {
    p,
    title,
    multiCamera,
    pageCount,
    sceneCount,
    offeredTypes,
    baselines,
    lastSentBaseline,
    activeAgainstId,
    needsChangedLines,
    changedLines,
    pageIndexes,
    previewWatermark,
    name,
    setName: (next: string) => {
      setNameEdited(true);
      setName(next);
    },
    what,
    setWhat: (next: WhatSelection) => {
      setWhatEdited(true);
      setWhat(next);
    },
    selectedFiles,
    toggleFile,
    setAgainstVersionId,
    watermark,
    setWatermark,
    watermarkLocked,
    groups,
    people,
    selectedGroupIds,
    addGroup,
    removeGroup: (id: string) =>
      setSelectedGroupIds((list) => list.filter((entry) => entry !== id)),
    selectedPeopleIds,
    addPerson,
    removePerson: (id: string) =>
      setSelectedPeopleIds((list) => list.filter((entry) => entry !== id)),
    distinctCount,
    linkEnabled,
    setLinkEnabled: (on: boolean) => {
      setLinkTouched(true);
      setLinkEnabled(on);
    },
    expiryIndex,
    setExpiryIndex,
    askWhoTheyAre,
    setAskWhoTheyAre,
    nobody,
    chooseNobody: (on: boolean) => {
      if (!on) return;
      setLinkTouched(true);
      setSelectedGroupIds([]);
      setSelectedPeopleIds([]);
      setLinkEnabled(false);
    },
    actionLabel,
    busyLabel,
    busy,
    disabledReason,
    problem,
    runSend,
  };
}
