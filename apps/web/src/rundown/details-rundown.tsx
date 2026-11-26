// Details → Rundown: Date, Air (24-hour HH:MM, data-tour="rundown:air"), Target, Air window starts and MOS toggle.
import { setRundownFields } from "@manent/crdt";
import type { RundownFieldsJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import {
  Button,
  Input,
  Label,
  RUNDOWN_WORDS as RW,
  formatDuration,
  formatTime,
} from "@manent/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { DatePickerPopover } from "./date-picker-popover.tsx";
import { DetailsBroadcast } from "./details-broadcast.tsx";
import {
  MS_PER_MINUTE,
  airAtOnDate,
  isoDateOfInstant,
  moveAirAtToDate,
  parseAirTime,
  parseWindowMinutes,
  useProjectRundownIndex,
} from "./details-rundown-fields.ts";
import { formatAirDate, parseDurationMs } from "./dur-format.ts";
import { recordRundownUndo } from "./handlers.ts";
import { useRundownView } from "./rundown-session.ts";
import {
  RundownFieldAlert,
  RundownHintedTextField,
  handleRundownFieldKeyDown,
} from "./rundown-states.tsx";

interface Drafts {
  dateError: string | null;
  airDraft: string | null;
  airError: string | null;
  targetDraft: string | null;
  targetError: string | null;
  windowDraft: string | null;
  windowError: string | null;
}

const EMPTY: Drafts = Object.freeze({
  dateError: null,
  airDraft: null,
  airError: null,
  targetDraft: null,
  targetError: null,
  windowDraft: null,
  windowError: null,
});

function RundownDetailsForm(props: {
  readonly docId: string;
  readonly fields: RundownFieldsJSON;
  readonly readOnly: boolean;
  readonly showNeedsEditRundowns: boolean;
}): ReactNode {
  const { docId, fields, readOnly, showNeedsEditRundowns } = props;
  const services = useServices();
  const { now } = useEnvironment();
  const handleRef = useRef<DocHandle | null>(null);
  const lastDateRef = useRef<string | null>(null);
  const { isDateTaken, writeIndexAirDate } = useProjectRundownIndex(docId);
  const [st, setSt] = useState<Drafts>(EMPTY);
  const uid = useId();
  const set = (p: Partial<Drafts>): void =>
    setSt((prev) => ({ ...prev, ...p }));

  useEffect(() => {
    if (readOnly) {
      handleRef.current = null;
      return;
    }
    let live = true;
    let opened: DocHandle | null = null;
    void services.openHandle(docId).then(
      (handle) => {
        if (!live) void handle.close();
        else {
          opened = handle;
          handleRef.current = handle;
        }
      },
      () => {},
    );
    return () => {
      live = false;
      handleRef.current = null;
      if (opened !== null) void opened.close();
    };
  }, [services, docId, readOnly]);

  useEffect(() => {
    if (
      readOnly ||
      lastDateRef.current === null ||
      fields.airDate === "" ||
      fields.airDate === lastDateRef.current
    )
      return;
    lastDateRef.current = fields.airDate;
    writeIndexAirDate(fields.airDate);
  }, [fields.airDate, readOnly, writeIndexAirDate]);

  const nowMs = now();
  const formattedDate =
    fields.airDate === ""
      ? ""
      : formatAirDate(fields.airDate, nowMs) || fields.airDate;
  const airDisplay = fields.airAt === null ? "" : formatTime(fields.airAt);
  const targetDisplay =
    fields.targetMs === null ? "" : formatDuration(fields.targetMs);
  const windowMinutes = Math.round(fields.windowLeadMs / MS_PER_MINUTE);

  const writeFields = (patch: Partial<RundownFieldsJSON>): boolean => {
    const handle = handleRef.current;
    if (handle === null || readOnly) return false;
    setRundownFields(handle.doc(), patch);
    recordRundownUndo(docId, { message: null });
    return true;
  };

  const handleSelectDate = (nextIso: string): void => {
    if (readOnly) return;
    if (nextIso === fields.airDate) return set({ dateError: null });
    if (isDateTaken(nextIso))
      return set({
        dateError: RW.dateAlreadyHasRundown(
          formatAirDate(nextIso, now()) || nextIso,
        ),
      });
    set({ dateError: null });
    const nextAirAt =
      fields.airAt === null ? null : moveAirAtToDate(fields.airAt, nextIso);
    if (
      !writeFields(
        nextAirAt === null
          ? { airDate: nextIso }
          : { airDate: nextIso, airAt: nextAirAt },
      )
    )
      return;
    lastDateRef.current = nextIso;
    writeIndexAirDate(nextIso);
  };

  const commitAir = (): void => {
    if (readOnly || st.airDraft === null) return;
    const raw = st.airDraft.trim();
    if (raw === "")
      return set({ airDraft: null, airError: RW.airTimeRequired });
    const parsed = parseAirTime(raw);
    const base = fields.airDate || isoDateOfInstant(fields.airAt ?? now());
    const next =
      parsed === null ? null : airAtOnDate(base, parsed.hours, parsed.minutes);
    if (next === null)
      return set({ airDraft: null, airError: RW.invalidAirTime(raw) });
    set({ airDraft: null, airError: null });
    if (next !== fields.airAt) writeFields({ airAt: next });
  };

  const commitTarget = (): void => {
    if (readOnly || st.targetDraft === null) return;
    const raw = st.targetDraft.trim();
    if (raw === "")
      return set({ targetDraft: null, targetError: RW.targetRequired });
    const next = parseDurationMs(raw);
    if (next === null)
      return set({ targetDraft: null, targetError: RW.invalidTarget(raw) });
    set({ targetDraft: null, targetError: null });
    if (next !== fields.targetMs) writeFields({ targetMs: next });
  };

  const commitWindow = (): void => {
    if (readOnly || st.windowDraft === null) return;
    const raw = st.windowDraft.trim();
    const parsed = parseWindowMinutes(raw);
    if (parsed === null)
      return set({
        windowDraft: null,
        windowError: RW.invalidAirWindow(raw === "" ? RW.dash : raw),
      });
    set({ windowDraft: null, windowError: null });
    const next = parsed * MS_PER_MINUTE;
    if (next !== fields.windowLeadMs) writeFields({ windowLeadMs: next });
  };

  const inputClass = readOnly
    ? "h-control tabular-nums text-ui text-fg aria-invalid:border-line-strong aria-invalid:ring-0"
    : "h-control tabular-nums text-ui aria-invalid:border-line-strong aria-invalid:ring-0";

  return (
    <div className="flex flex-col gap-3">
      {showNeedsEditRundowns ? (
        <p className="text-meta text-fg">{RW.needsEditRundowns}</p>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${uid}-d`} className="text-ui font-medium text-fg">
          {RW.dateLabel}
        </Label>
        {readOnly ? (
          <Button
            id={`${uid}-d`}
            type="button"
            variant="outline"
            aria-disabled="true"
            aria-describedby={st.dateError ? `${uid}-de` : undefined}
            className="h-control w-full cursor-default justify-between text-ui font-normal text-fg"
          >
            <span className="truncate tabular-nums">{formattedDate}</span>
          </Button>
        ) : (
          <DatePickerPopover
            id={`${uid}-d`}
            value={fields.airDate}
            formattedValue={formattedDate}
            label={RW.dateLabel}
            readOnly={false}
            describedBy={st.dateError ? `${uid}-de` : undefined}
            nowMs={nowMs}
            onSelect={handleSelectDate}
          />
        )}
        {st.dateError ? (
          <RundownFieldAlert id={`${uid}-de`} message={st.dateError} />
        ) : null}
      </div>

      <RundownHintedTextField
        id={`${uid}-a`}
        label={RW.airLabel}
        hint={RW.airHint(formattedDate)}
        value={st.airDraft ?? airDisplay}
        error={st.airError}
        readOnly={readOnly}
        inputClass={inputClass}
        tourTarget="rundown:air"
        onChange={(airDraft) => set({ airDraft, airError: null })}
        onCommit={commitAir}
        onCancel={() => set({ airDraft: null, airError: null })}
      />

      <RundownHintedTextField
        id={`${uid}-t`}
        label={RW.targetLabel}
        hint={RW.targetHint}
        value={st.targetDraft ?? targetDisplay}
        error={st.targetError}
        readOnly={readOnly}
        inputClass={inputClass}
        onChange={(targetDraft) => set({ targetDraft, targetError: null })}
        onCommit={commitTarget}
        onCancel={() => set({ targetDraft: null, targetError: null })}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor={`${uid}-w`} className="text-ui font-medium text-fg">
          {RW.airWindowStartsLabel}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={`${uid}-w`}
            inputMode="numeric"
            readOnly={readOnly}
            aria-invalid={st.windowError ? true : undefined}
            aria-describedby={
              st.windowError ? `${uid}-wu ${uid}-we` : `${uid}-wu`
            }
            value={st.windowDraft ?? String(windowMinutes)}
            onChange={(e) => {
              if (!readOnly)
                set({ windowDraft: e.target.value, windowError: null });
            }}
            onKeyDown={(e) =>
              handleRundownFieldKeyDown(e, commitWindow, () =>
                set({ windowDraft: null, windowError: null }),
              )
            }
            onBlur={commitWindow}
            className={`${inputClass} w-20`}
          />
          <span id={`${uid}-wu`} className="text-ui text-fg-muted">
            {RW.airWindowUnit}
          </span>
        </div>
        {st.windowError ? (
          <RundownFieldAlert id={`${uid}-we`} message={st.windowError} />
        ) : null}
      </div>

      <DetailsBroadcast docId={docId} />
    </div>
  );
}

/** Details → Rundown section: drawn while `docId` is an open rundown. */
export function RundownDetails(props: { docId: string }): ReactNode {
  const view = useRundownView(props.docId);
  if (view === null || view.rundown === null) return null;
  return (
    <RundownDetailsForm
      key={props.docId}
      docId={props.docId}
      fields={view.rundown.rundown}
      readOnly={view.access !== "edit"}
      showNeedsEditRundowns={view.access === "view_only"}
    />
  );
}
