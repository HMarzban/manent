// Name, What and As rows for the Send draft form.
import {
  DRAFTS_WORDS,
  Input,
  PRODUCTION_WORDS,
  SEND_WORDS,
  Segmented,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@manent/ui";
import { useId } from "react";
import type { ReactNode } from "react";
import type { ExportFileType } from "../send/script-file.ts";
import { whatOffered } from "../send/what-options.ts";
import type { DraftWhatId, WhatSelection } from "./draft-output.ts";

export interface DraftBaselineOption {
  readonly id: string;
  readonly name: string;
}

export function NameRowContent(props: {
  name: string;
  onChange(name: string): void;
}): ReactNode {
  return (
    <Input
      aria-label={DRAFTS_WORDS.draftNameLabel}
      value={props.name}
      onChange={(event) => props.onChange(event.target.value)}
      className="max-w-sm"
    />
  );
}

function toWhatId(raw: string): DraftWhatId {
  if (
    raw === "pages" ||
    raw === "scenes" ||
    raw === "revised_pages" ||
    raw === "full_draft" ||
    raw === "changed_pages"
  )
    return raw;
  return "whole_script";
}

function clampBound(raw: string, max: number): number {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return Math.min(max, parsed);
}

export function WhatRowContent(props: {
  multiCamera: boolean;
  locked: boolean;
  primaryFileTypeId: string | null;
  what: WhatSelection;
  pageCount: number;
  sceneCount: number;
  lastSentDraftName: string | null;
  onChange(next: WhatSelection): void;
}): ReactNode {
  const {
    multiCamera,
    locked,
    primaryFileTypeId,
    what,
    pageCount,
    sceneCount,
    lastSentDraftName,
    onChange,
  } = props;

  if (multiCamera) {
    const value: DraftWhatId =
      what.id === "changed_pages" ? "changed_pages" : "full_draft";
    return (
      <div className="flex flex-col gap-2" data-tour="send:what">
        <Segmented
          label={SEND_WORDS.what}
          value={value}
          options={[
            { value: "full_draft", label: DRAFTS_WORDS.fullDraft },
            { value: "changed_pages", label: DRAFTS_WORDS.changedPages },
          ]}
          onChange={(chosen) =>
            onChange({
              ...what,
              id: chosen === "changed_pages" ? "changed_pages" : "full_draft",
            })
          }
        />
        {value === "full_draft" && lastSentDraftName !== null ? (
          <p className="text-meta text-fg-muted">
            {DRAFTS_WORDS.markedAgainstLastSent(lastSentDraftName)}
          </p>
        ) : null}
      </div>
    );
  }

  const offered = whatOffered("send_draft", primaryFileTypeId, locked);
  const active =
    offered.find((entry) => entry.id === what.id) ?? offered[0] ?? null;
  if (active === null) return null;

  return (
    <div className="flex flex-col gap-2" data-tour="send:what">
      {offered.length === 1 ? (
        <span>{active.label}</span>
      ) : (
        <Segmented
          label={SEND_WORDS.what}
          value={active.id}
          options={offered.map(({ id, label }) => ({ value: id, label }))}
          onChange={(chosen) => onChange({ ...what, id: toWhatId(chosen) })}
        />
      )}
      {active.id === "pages" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={Math.max(1, pageCount)}
            aria-label={DRAFTS_WORDS.firstPage}
            value={what.firstPage}
            onChange={(event) =>
              onChange({
                ...what,
                firstPage: clampBound(
                  event.target.value,
                  Math.max(1, pageCount),
                ),
              })
            }
            className="w-20 tabular-nums"
          />
          <Input
            type="number"
            min={1}
            max={Math.max(1, pageCount)}
            aria-label={DRAFTS_WORDS.lastPage}
            value={what.lastPage}
            onChange={(event) =>
              onChange({
                ...what,
                lastPage: clampBound(
                  event.target.value,
                  Math.max(1, pageCount),
                ),
              })
            }
            className="w-20 tabular-nums"
          />
          <span className="text-meta text-fg-muted tabular-nums">
            {DRAFTS_WORDS.pagesRange(what.firstPage, what.lastPage)}
          </span>
        </div>
      ) : null}
      {active.id === "scenes" ? (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="number"
            min={1}
            max={Math.max(1, sceneCount)}
            aria-label={DRAFTS_WORDS.firstScene}
            value={what.firstScene}
            onChange={(event) =>
              onChange({
                ...what,
                firstScene: clampBound(
                  event.target.value,
                  Math.max(1, sceneCount),
                ),
              })
            }
            className="w-20 tabular-nums"
          />
          <Input
            type="number"
            min={1}
            max={Math.max(1, sceneCount)}
            aria-label={DRAFTS_WORDS.lastScene}
            value={what.lastScene}
            onChange={(event) =>
              onChange({
                ...what,
                lastScene: clampBound(
                  event.target.value,
                  Math.max(1, sceneCount),
                ),
              })
            }
            className="w-20 tabular-nums"
          />
          <span className="text-meta text-fg-muted tabular-nums">
            {DRAFTS_WORDS.scenesRange(what.firstScene, what.lastScene)}
          </span>
        </div>
      ) : null}
    </div>
  );
}

function FileTick(props: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}): ReactNode {
  const id = useId();
  return (
    <span className="flex items-center gap-2">
      <Switch
        id={id}
        checked={props.checked}
        disabled={props.disabled}
        onCheckedChange={props.onChange}
      />
      <label
        htmlFor={id}
        className={
          props.disabled
            ? "cursor-not-allowed text-ui text-fg-muted"
            : "cursor-pointer text-ui"
        }
      >
        {props.label}
      </label>
    </span>
  );
}

export function AsRowContent(props: {
  offeredTypes: readonly ExportFileType[];
  baselines: readonly DraftBaselineOption[];
  selectedFiles: readonly string[];
  againstVersionId: string | null;
  watermark: boolean;
  watermarkLocked: boolean;
  onToggleFile(fileId: string, on: boolean): void;
  onAgainstChange(versionId: string): void;
  onWatermarkChange(on: boolean): void;
}): ReactNode {
  const {
    offeredTypes,
    baselines,
    selectedFiles,
    againstVersionId,
    watermark,
    watermarkLocked,
    onToggleFile,
    onAgainstChange,
    onWatermarkChange,
  } = props;
  const watermarkId = useId();
  const watermarkDescId = useId();

  const pdfType = offeredTypes.find((entry) => entry.id === "pdf") ?? null;
  const otherTypes = offeredTypes.filter((entry) => entry.id !== "pdf");
  const baselineItems = baselines.map((entry) => ({
    value: entry.id,
    label: entry.name,
  }));
  const activeBaseline =
    baselines.find((entry) => entry.id === againstVersionId) ??
    baselines[0] ??
    null;

  return (
    <div className="flex flex-col gap-3" data-tour="send:as">
      <div className="flex flex-col gap-2">
        {pdfType === null ? null : (
          <FileTick
            label={pdfType.label}
            checked={selectedFiles.includes(pdfType.id)}
            onChange={(on) => onToggleFile(pdfType.id, on)}
          />
        )}
        {baselines.length === 0 ? null : (
          <div className="flex flex-wrap items-center gap-2">
            <FileTick
              label={
                selectedFiles.includes("pdf_asterisks") &&
                activeBaseline !== null
                  ? DRAFTS_WORDS.pdfWithAsterisksAgainst
                  : PRODUCTION_WORDS.pdfMarked
              }
              checked={selectedFiles.includes("pdf_asterisks")}
              onChange={(on) => onToggleFile("pdf_asterisks", on)}
            />
            {selectedFiles.includes("pdf_asterisks") &&
            activeBaseline !== null ? (
              <Select
                items={baselineItems}
                value={activeBaseline.id}
                onValueChange={(value) => {
                  if (value !== null) onAgainstChange(value);
                }}
              >
                <SelectTrigger aria-label={DRAFTS_WORDS.asterisksAgainst}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {baselineItems.map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
          </div>
        )}
        {otherTypes.map((type) => (
          <FileTick
            key={type.id}
            label={type.label}
            checked={selectedFiles.includes(type.id)}
            onChange={(on) => onToggleFile(type.id, on)}
          />
        ))}
      </div>

      <div className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <Switch
            id={watermarkId}
            checked={watermark || watermarkLocked}
            disabled={watermarkLocked}
            onCheckedChange={onWatermarkChange}
            aria-describedby={watermarkDescId}
          />
          <label
            htmlFor={watermarkId}
            className={
              watermarkLocked
                ? "cursor-not-allowed text-ui text-fg-muted"
                : "cursor-pointer text-ui"
            }
          >
            {DRAFTS_WORDS.watermark}
          </label>
        </div>
        <p id={watermarkDescId} className="text-meta text-fg-muted">
          {DRAFTS_WORDS.watermarkLine}
        </p>
      </div>
    </div>
  );
}
