// Details → Rundown: Date, Air (24-hour HH:MM, data-tour="rundown:air"), Target and Air window starts.
import { setRundownFields } from "@manent/crdt";
import type { RundownFieldsJSON } from "@manent/schema";
import type { DocHandle } from "@manent/sync-client";
import {
  Input,
  Label,
  RUNDOWN_WORDS,
  formatDuration,
  formatTime,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
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

function FieldAlert(props: {
  readonly id: string;
  readonly message: string;
}): ReactNode {
  return (
    <p
      id={props.id}
      role="alert"
      className="flex items-start gap-1 text-meta text-fg"
    >
      <TriangleExclamationPointIcon
        aria-hidden="true"
        className="mt-0.5 size-icon shrink-0 text-attention"
      />
      <span>{props.message}</span>
    </p>
  );
}

function handleFieldKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  commit: () => void,
  cancel: () => void,
): void {
  if (event.key === "Enter" && !event.nativeEvent.isComposing) {
    event.preventDefault();
    commit();
    return;
  }
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    cancel();
  }
}

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
  }, [services, docId]);

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

  const dateId = useId();
  const dateErrorId = useId();
  const airId = useId();
  const airHintId = useId();
  const airErrorId = useId();
  const targetId = useId();
  const targetHintId = useId();
  const targetErrorId = useId();
  const windowId = useId();
  const windowUnitId = useId();
  const windowErrorId = useId();

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
    ? "h-control cursor-not-allowed tabular-nums text-ui opacity-50 aria-invalid:border-line-strong aria-invalid:ring-0"
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
        <DatePickerPopover
          id={dateId}
          value={fields.airDate}
          formattedValue={formattedDate}
          label={RUNDOWN_WORDS.dateLabel}
          readOnly={readOnly}
          describedBy={dateError === null ? undefined : dateErrorId}
          nowMs={nowMs}
          onSelect={handleSelectDate}
        />
        {dateError === null ? null : (
          <FieldAlert id={dateErrorId} message={dateError} />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={airId} className="text-ui font-medium text-fg">
          {RUNDOWN_WORDS.airLabel}
        </Label>
        <Input
          id={airId}
          data-tour="rundown:air"
          readOnly={readOnly}
          aria-invalid={airError !== null ? true : undefined}
          aria-describedby={
            airError === null ? airHintId : `${airHintId} ${airErrorId}`
          }
          value={airDraft ?? airDisplay}
          onChange={(event) => {
            if (readOnly) return;
            setAirDraft(event.target.value);
            if (airError !== null) setAirError(null);
          }}
          onKeyDown={(event) =>
            handleFieldKeyDown(event, commitAir, () => {
              setAirDraft(null);
              setAirError(null);
            })
          }
          onBlur={commitAir}
          className={inputClass}
        />
        <p id={airHintId} className="text-meta text-fg-muted">
          {RUNDOWN_WORDS.airHint(formattedDate)}
        </p>
        {airError === null ? null : (
          <FieldAlert id={airErrorId} message={airError} />
        )}
      </div>

      <div className="flex flex-col gap-1">
        <Label htmlFor={targetId} className="text-ui font-medium text-fg">
          {RUNDOWN_WORDS.targetLabel}
        </Label>
        <Input
          id={targetId}
          readOnly={readOnly}
          aria-invalid={targetError !== null ? true : undefined}
          aria-describedby={
            targetError === null
              ? targetHintId
              : `${targetHintId} ${targetErrorId}`
          }
          value={targetDraft ?? targetDisplay}
          onChange={(event) => {
            if (readOnly) return;
            setTargetDraft(event.target.value);
            if (targetError !== null) setTargetError(null);
          }}
          onKeyDown={(event) =>
            handleFieldKeyDown(event, commitTarget, () => {
              setTargetDraft(null);
              setTargetError(null);
            })
          }
          onBlur={commitTarget}
          className={inputClass}
        />
        <p id={targetHintId} className="text-meta text-fg-muted">
          {RUNDOWN_WORDS.targetHint}
        </p>
        {targetError === null ? null : (
          <FieldAlert id={targetErrorId} message={targetError} />
        )}
      </div>

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
              handleFieldKeyDown(event, commitWindow, () => {
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
          <FieldAlert id={windowErrorId} message={windowError} />
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
