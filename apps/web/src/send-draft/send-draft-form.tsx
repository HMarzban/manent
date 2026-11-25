// The Send draft form: Checks, Name (from ladder), What, As, To, remembering last choices per group.
import { useMemo } from "react";
import type { ReactNode } from "react";
import { checksRow } from "../checks/send-row.tsx";
import type { SendForm, SendFormProps } from "../screens/send/forms.ts";
import { SendFormSkeleton, SendFrame } from "../screens/send/send-frame.tsx";
import type { SendRow } from "../screens/send/send-frame.tsx";
import { outsideFontRow } from "../send/output-checks.tsx";
import { useDraftSendAccess } from "./access.ts";
import type { DraftSendAccess } from "./access.ts";
import { DraftPreviewTiles } from "./preview-tiles.tsx";
import { ToRowContent } from "./to-row.tsx";
import { useSendDraft } from "./use-send-draft.ts";
import {
  AsRowContent,
  NameRowContent,
  WhatRowContent,
} from "./what-as-rows.tsx";

function SendDraftForm(props: {
  docId: string;
  access: DraftSendAccess;
}): ReactNode {
  const { docId, access } = props;
  const draft = useSendDraft(docId, access);
  const { p } = draft;

  const checks: SendRow | null = useMemo(() => {
    if (p === null) return null;
    const fontWarning = outsideFontRow(p);
    const scriptChecks = checksRow(docId);
    if (fontWarning === null) return scriptChecks;
    return {
      id: "checks",
      content: (
        <div className="flex flex-col gap-2">
          {scriptChecks.content}
          {fontWarning.content}
        </div>
      ),
    };
  }, [docId, p]);

  const rows: SendRow[] = [
    ...(checks === null ? [] : [checks]),
    {
      id: "name",
      content: <NameRowContent name={draft.name} onChange={draft.setName} />,
    },
    {
      id: "what",
      content: (
        <WhatRowContent
          multiCamera={draft.multiCamera}
          locked={access.offered.locked}
          primaryFileTypeId={
            draft.selectedFiles[0] ?? draft.offeredTypes[0]?.id ?? null
          }
          what={draft.what}
          pageCount={draft.pageCount}
          sceneCount={draft.sceneCount}
          lastSentDraftName={draft.lastSentBaseline?.name ?? null}
          onChange={draft.setWhat}
        />
      ),
    },
    {
      id: "as",
      content: (
        <AsRowContent
          offeredTypes={draft.offeredTypes}
          baselines={draft.baselines}
          selectedFiles={draft.selectedFiles}
          againstVersionId={draft.activeAgainstId}
          watermark={draft.watermark}
          watermarkLocked={draft.watermarkLocked}
          onToggleFile={draft.toggleFile}
          onAgainstChange={draft.setAgainstVersionId}
          onWatermarkChange={draft.setWatermark}
        />
      ),
    },
    {
      id: "to",
      content: (
        <ToRowContent
          groups={draft.groups}
          people={draft.people}
          selectedGroupIds={draft.selectedGroupIds}
          selectedPeopleIds={draft.selectedPeopleIds}
          distinctCount={draft.distinctCount}
          linkEnabled={draft.linkEnabled}
          expiryIndex={draft.expiryIndex}
          askWhoTheyAre={draft.askWhoTheyAre}
          nobody={draft.nobody}
          onAddGroup={draft.addGroup}
          onRemoveGroup={draft.removeGroup}
          onAddPerson={draft.addPerson}
          onRemovePerson={draft.removePerson}
          onLinkEnabledChange={draft.setLinkEnabled}
          onExpiryChange={draft.setExpiryIndex}
          onAskWhoTheyAreChange={draft.setAskWhoTheyAre}
          onNobodyChange={draft.chooseNobody}
        />
      ),
    },
  ];

  return (
    <SendFrame
      title={draft.actionLabel}
      aside={null}
      rows={rows}
      checksPending={p === null}
      pages={
        <DraftPreviewTiles
          p={p}
          pageIndexes={draft.pageIndexes}
          title={draft.title}
          watermark={draft.previewWatermark}
          changedLines={draft.needsChangedLines ? draft.changedLines : null}
        />
      }
      action={{
        label: draft.actionLabel,
        busyLabel: draft.busyLabel,
        busy: draft.busy,
        disabledReason: draft.disabledReason,
        problem: draft.problem,
        progress: null,
        cancel: null,
        run:
          draft.disabledReason !== null || p === null
            ? null
            : () => void draft.runSend(),
      }}
    />
  );
}

function SendDraftBody(props: SendFormProps): ReactNode {
  const access = useDraftSendAccess(props.docId);
  if (access.pending) return <SendFormSkeleton rows={5} />;
  if (!access.ready) return null;
  return <SendDraftForm docId={props.docId} access={access} />;
}

export const sendDraftForm: SendForm = {
  id: "send_draft",
  useAvailable(docId) {
    return useDraftSendAccess(docId).available;
  },
  Body: SendDraftBody,
};
