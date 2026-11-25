// Details → Rundown: Date, Air (24-hour HH:MM, data-tour="rundown:air"), Target and Air window starts.
import { setRundownFields } from "@manent/crdt";
import type { RundownFieldsJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import {
  Button,
  Input,
  Label,
  RUNDOWN_WORDS,
  formatDuration,
  formatTime,
} from "@manent/ui";
import { useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../services/context.tsx";
import { DatePickerPopover } from "./date-picker-popover.tsx";
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

interface RundownDetailsFormProps {
  readonly docId: string;
  readonly fields: RundownFieldsJSON;
  readonly readOnly: boolean;
  readonly showNeedsEditRundowns: boolean;
}

function RundownDetailsForm(props: RundownDetailsFormProps): ReactNode {
  const { docId, fields, readOnly, showNeedsEditRundowns } = props;
  const services = useServices();
  const { now } = useEnvironment();
  const handleRef = useRef<DocHandle | null>(null);
  const lastWrittenDateRef = useRef<string | null>(null);
  const { isDateTaken, writeIndexAirDate } = useProjectRundownIndex(docId);

  useEffect(() => {
    if (readOnly) {
      handleRef.current = null;
      return;
    }
    let live = true;
    let opened: DocHandle | null = null;
    void services
      .openHandle(docId)
      .then((handle) => {
        if (!live) {
          void handle.close();
          return;
        }
        opened = handle;
        handleRef.current = handle;
      })
      .catch(() => {
        // sync could not start: fields remain readable from the live view
      });
    return () => {
      live = false;
      handleRef.current = null;
      if (opened !== null) void opened.close();
    };
  }, [services, docId, readOnly]);

  // Keep the workspace index's airDate aligned when an own Date change is undone or redone.
  useEffect(() => {
    if (readOnly || lastWrittenDateRef.current === null) return;
    if (
      fields.airDate !== "" &&
      fields.airDate !== lastWrittenDateRef.current
    ) {
      lastWrittenDateRef.current = fields.airDate;
      writeIndexAirDate(fields.airDate);
    }
  }, [fields.airDate, readOnly, writeIndexAirDate]);

  const [dateError, setDateError] = useState<string | null>(null);
  const [airDraft, setAirDraft] = useState<string | null>(null);
  const [airError, setAirError] = useState<string | null>(null);
  const [targetDraft, setTargetDraft] = useState<string | null>(null);
  const [targetError, setTargetError] = useState<string | null>(null);
  const [windowDraft, setWindowDraft] = useState<string | null>(null);
  const [windowError, setWindowError] = useState<string | null>(null);

  const uid = useId();
  const dateId = `${uid}-date`;
  const dateErrorId = `${uid}-date-err`;
  const airId = `${uid}-air`;
  const targetId = `${uid}-target`;
  const windowId = `${uid}-window`;
  const windowUnitId = `${uid}-window-unit`;
  const windowErrorId = `${uid}-window-err`;

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
    if (nextIso === fields.airDate) {
      setDateError(null);
      return;
    }
    if (isDateTaken(nextIso)) {
      const label = formatAirDate(nextIso, now()) || nextIso;
      setDateError(RUNDOWN_WORDS.dateAlreadyHasRundown(label));
      return;
    }
    setDateError(null);
    const nextAirAt =
      fields.airAt === null ? null : moveAirAtToDate(fields.airAt, nextIso);
    const written = writeFields(
      nextAirAt === null
        ? { airDate: nextIso }
        : { airDate: nextIso, airAt: nextAirAt },
    );
    if (!written) return;
    lastWrittenDateRef.current = nextIso;
    writeIndexAirDate(nextIso);
  };

  const commitAir = (): void => {
    if (readOnly || airDraft === null) return;
    const trimmed = airDraft.trim();
    setAirDraft(null);
    if (trimmed === "") {
      setAirError(RUNDOWN_WORDS.airTimeRequired);
      return;
    }
    const parsed = parseAirTime(trimmed);
    if (parsed === null) {
      setAirError(RUNDOWN_WORDS.invalidAirTime(trimmed));
      return;
    }
    const baseDate = fields.airDate || isoDateOfInstant(fields.airAt ?? now());
    const nextAirAt = airAtOnDate(baseDate, parsed.hours, parsed.minutes);
    if (nextAirAt === null) {
      setAirError(RUNDOWN_WORDS.invalidAirTime(trimmed));
      return;
    }
    setAirError(null);
    if (nextAirAt !== fields.airAt) writeFields({ airAt: nextAirAt });
  };

  const commitTarget = (): void => {
    if (readOnly || targetDraft === null) return;
    const trimmed = targetDraft.trim();
    setTargetDraft(null);
    if (trimmed === "") {
      setTargetError(RUNDOWN_WORDS.targetRequired);
      return;
    }
    const parsed = parseDurationMs(trimmed);
    if (parsed === null) {
      setTargetError(RUNDOWN_WORDS.invalidTarget(trimmed));
      return;
    }
    setTargetError(null);
    if (parsed !== fields.targetMs) writeFields({ targetMs: parsed });
  };

  const commitWindow = (): void => {
    if (readOnly || windowDraft === null) return;
    const trimmed = windowDraft.trim();
    setWindowDraft(null);
    const parsed = parseWindowMinutes(trimmed);
    if (parsed === null) {
      setWindowError(
        RUNDOWN_WORDS.invalidAirWindow(
          trimmed === "" ? RUNDOWN_WORDS.dash : trimmed,
        ),
      );
      return;
    }
    setWindowError(null);
    const nextLeadMs = parsed * MS_PER_MINUTE;
    if (nextLeadMs !== fields.windowLeadMs)
      writeFields({ windowLeadMs: nextLeadMs });
  };

  const inputClass = readOnly
    ? "h-control tabular-nums text-ui text-fg aria-invalid:border-line-strong aria-invalid:ring-0"
    : "h-control tabular-nums text-ui aria-invalid:border-line-strong aria-invalid:ring-0";

  return (
    <div className="flex flex-col gap-3">
      {showNeedsEditRundowns ? (
        <p className="text-meta text-fg">{RUNDOWN_WORDS.needsEditRundowns}</p>
      ) : null}

      <div className="flex flex-col gap-1">
        <Label htmlFor={dateId} className="text-ui font-medium text-fg">
          {RUNDOWN_WORDS.dateLabel}
        </Label>
        {readOnly ? (
          <Button
            id={dateId}
            type="button"
            variant="outline"
            aria-disabled="true"
            aria-describedby={dateError === null ? undefined : dateErrorId}
            className="h-control w-full cursor-default justify-between text-ui font-normal text-fg"
          >
            <span className="truncate tabular-nums">{formattedDate}</span>
          </Button>
        ) : (
          <DatePickerPopover
            id={dateId}
            value={fields.airDate}
            formattedValue={formattedDate}
            label={RUNDOWN_WORDS.dateLabel}
            readOnly={false}
            describedBy={dateError === null ? undefined : dateErrorId}
            nowMs={nowMs}
            onSelect={handleSelectDate}
          />
        )}
        {dateError === null ? null : (
          <RundownFieldAlert id={dateErrorId} message={dateError} />
        )}
      </div>

      <RundownHintedTextField
        id={airId}
        label={RUNDOWN_WORDS.airLabel}
        hint={RUNDOWN_WORDS.airHint(formattedDate)}
        value={airDraft ?? airDisplay}
        error={airError}
        readOnly={readOnly}
        inputClass={inputClass}
        tourTarget="rundown:air"
        onChange={(next) => {
          setAirDraft(next);
          if (airError !== null) setAirError(null);
        }}
        onCommit={commitAir}
        onCancel={() => {
          setAirDraft(null);
          setAirError(null);
        }}
      />

      <RundownHintedTextField
        id={targetId}
        label={RUNDOWN_WORDS.targetLabel}
        hint={RUNDOWN_WORDS.targetHint}
        value={targetDraft ?? targetDisplay}
        error={targetError}
        readOnly={readOnly}
        inputClass={inputClass}
        onChange={(next) => {
          setTargetDraft(next);
          if (targetError !== null) setTargetError(null);
        }}
        onCommit={commitTarget}
        onCancel={() => {
          setTargetDraft(null);
          setTargetError(null);
        }}
      />

      <div className="flex flex-col gap-1">
        <Label htmlFor={windowId} className="text-ui font-medium text-fg">
          {RUNDOWN_WORDS.airWindowStartsLabel}
        </Label>
        <div className="flex items-center gap-2">
          <Input
            id={windowId}
            inputMode="numeric"
            readOnly={readOnly}
            aria-invalid={windowError !== null ? true : undefined}
            aria-describedby={
              windowError === null
                ? windowUnitId
                : `${windowUnitId} ${windowErrorId}`
            }
            value={windowDraft ?? String(windowMinutes)}
            onChange={(event) => {
              if (readOnly) return;
              setWindowDraft(event.target.value);
              if (windowError !== null) setWindowError(null);
            }}
            onKeyDown={(event) =>
              handleRundownFieldKeyDown(event, commitWindow, () => {
                setWindowDraft(null);
                setWindowError(null);
              })
            }
            onBlur={commitWindow}
            className={`${inputClass} w-20`}
          />
          <span id={windowUnitId} className="text-ui text-fg-muted">
            {RUNDOWN_WORDS.airWindowUnit}
          </span>
        </div>
        {windowError === null ? null : (
          <RundownFieldAlert id={windowErrorId} message={windowError} />
        )}
      </div>
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
