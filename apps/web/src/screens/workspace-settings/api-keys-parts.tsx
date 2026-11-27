// Sub-components for Workspace settings -> API keys: shown-once secret panel, key rows with in-place revoke, and inline refusals.
import type { ApiKeyView } from "@manent/sync-protocol";
import {
  API_KEYS_WORDS,
  Button,
  Input,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WORKSPACE_WORDS,
  dayNumber,
  formatDate,
  formatDayTime,
  formatTime,
} from "@manent/ui";
import {
  CheckIcon,
  CopyIcon,
  TriangleExclamationPointIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ReactNode, Ref } from "react";

export interface ShownOnceKey {
  readonly id: string;
  readonly name: string;
  readonly key: string;
}

const COPIED_RESET_MS = 2500;

function formatActivityTime(at: number, now: number): string {
  const daysAgo = dayNumber(now) - dayNumber(at);
  return daysAgo >= 0 && daysAgo < 7
    ? formatDayTime(at, now)
    : `${formatDate(at)} ${formatTime(at)}`;
}

export function InlineRefusal(props: {
  sentence: string;
  onRetry?: () => void;
}): ReactNode {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-2 text-ui text-fg"
    >
      <span className="flex items-center gap-1">
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-attention"
        />
        {props.sentence}
      </span>
      {props.onRetry === undefined ? null : (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="cursor-pointer"
          onClick={props.onRetry}
        >
          {WORKSPACE_WORDS.tryAgain}
        </Button>
      )}
    </div>
  );
}

export function GuardedButton(props: {
  label: string;
  type: "button" | "submit";
  variant: "default" | "outline";
  size?: "default" | "sm";
  disabled: boolean;
  reason?: string;
  buttonRef?: Ref<HTMLButtonElement>;
  onClick?: () => void;
}): ReactNode {
  const button = (
    <Button
      ref={props.buttonRef}
      type={props.type}
      variant={props.variant}
      size={props.size}
      aria-disabled={props.disabled ? true : undefined}
      title={props.disabled ? props.reason : undefined}
      className={
        props.disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"
      }
      onClick={(event) => {
        if (props.disabled) {
          event.preventDefault();
          return;
        }
        props.onClick?.();
      }}
    >
      {props.label}
    </Button>
  );
  if (!props.disabled || props.reason === undefined) return button;
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent>{props.reason}</TooltipContent>
    </Tooltip>
  );
}

export function ShownOncePanel(props: {
  created: ShownOnceKey;
  mac: boolean;
  schedule: (fn: () => void, delayMs: number) => () => void;
}): ReactNode {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const resetTimerRef = useRef<(() => void) | null>(null);
  const [copied, setCopied] = useState(false);
  const [copyFallback, setCopyFallback] = useState(false);

  useEffect(() => {
    setCopied(false);
    setCopyFallback(false);
    return () => {
      resetTimerRef.current?.();
      resetTimerRef.current = null;
    };
  }, [props.created]);

  const handleCopy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(props.created.key);
      setCopyFallback(false);
      setCopied(true);
      resetTimerRef.current?.();
      resetTimerRef.current = props.schedule(() => {
        setCopied(false);
        resetTimerRef.current = null;
      }, COPIED_RESET_MS);
    } catch {
      // clipboard refused: select the field so the person can copy with the system shortcut
      setCopied(false);
      setCopyFallback(true);
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  };

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-2 rounded-surface border border-line-strong bg-raised p-4"
    >
      <p className="text-ui font-medium text-fg">{API_KEYS_WORDS.shownOnce}</p>
      <div className="flex flex-wrap items-center gap-2">
        <Input
          ref={inputRef}
          readOnly
          value={props.created.key}
          aria-label={API_KEYS_WORDS.newKeyLabel(props.created.name)}
          onFocus={(event) => event.currentTarget.select()}
          className="min-w-0 flex-1 border-line-strong bg-well font-mono text-ui text-fg"
        />
        <Button
          type="button"
          variant="outline"
          className="shrink-0 cursor-pointer"
          onClick={() => void handleCopy()}
        >
          {copied ? (
            <CheckIcon aria-hidden="true" className="size-icon text-ok" />
          ) : (
            <CopyIcon aria-hidden="true" className="size-icon" />
          )}
          {copied ? API_KEYS_WORDS.copied : API_KEYS_WORDS.copy}
        </Button>
      </div>
      {copyFallback ? (
        <p className="text-meta text-fg-muted">
          {API_KEYS_WORDS.pressToCopy(props.mac)}
        </p>
      ) : null}
    </div>
  );
}

export function ApiKeyRow(props: {
  entry: ApiKeyView;
  now: number;
  canChange: boolean;
  online: boolean;
  confirming: boolean;
  revoking: boolean;
  busy: boolean;
  refusal: string | null;
  onStartRevoke(id: string): void;
  onCancelRevoke(): void;
  onConfirmRevoke(entry: ApiKeyView): void;
}): ReactNode {
  const { entry, now, canChange, online, confirming, revoking, busy, refusal } =
    props;
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const revokeRef = useRef<HTMLButtonElement | null>(null);
  const restoreRevokeRef = useRef(false);

  useEffect(() => {
    if (confirming) {
      cancelRef.current?.focus();
    } else if (restoreRevokeRef.current) {
      restoreRevokeRef.current = false;
      revokeRef.current?.focus();
    }
  }, [confirming]);

  const handleCancel = (): void => {
    restoreRevokeRef.current = true;
    props.onCancelRevoke();
  };

  const revoked = entry.revokedAt !== null;
  const lastUsedText =
    entry.revokedAt !== null
      ? API_KEYS_WORDS.revokedAt(formatActivityTime(entry.revokedAt, now))
      : entry.lastUsedAt !== null
        ? formatActivityTime(entry.lastUsedAt, now)
        : API_KEYS_WORDS.neverUsed;

  return (
    <tbody className="border-b border-line last:border-b-0">
      <tr>
        <td
          className={
            revoked
              ? "px-4 py-3 text-ui text-fg-muted"
              : "px-4 py-3 text-ui font-medium text-fg"
          }
        >
          {entry.name}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-meta text-fg-muted tabular-nums">
          {formatDate(entry.createdAt)}
        </td>
        <td className="whitespace-nowrap px-4 py-3 text-meta text-fg-muted tabular-nums">
          {lastUsedText}
        </td>
        {canChange ? (
          <td className="whitespace-nowrap px-4 py-3 text-end">
            {revoked || confirming ? null : (
              <GuardedButton
                buttonRef={revokeRef}
                label={API_KEYS_WORDS.revoke}
                type="button"
                variant="outline"
                size="sm"
                disabled={!online || busy}
                reason={!online ? WORKSPACE_WORDS.needsConnection : undefined}
                onClick={() => props.onStartRevoke(entry.id)}
              />
            )}
          </td>
        ) : null}
      </tr>
      {canChange && confirming && !revoked ? (
        <tr
          className="bg-subtle"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !revoking) {
              event.preventDefault();
              handleCancel();
            }
          }}
        >
          <td colSpan={4} className="px-4 py-3">
            <div className="flex flex-col gap-3">
              <p className="text-ui text-fg">
                {API_KEYS_WORDS.revokeWarning(entry.name)}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  ref={cancelRef}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={revoking}
                  className={revoking ? "cursor-not-allowed" : "cursor-pointer"}
                  onClick={handleCancel}
                >
                  {API_KEYS_WORDS.cancel}
                </Button>
                <Button
                  type="button"
                  variant="destructive"
                  size="sm"
                  aria-disabled={!online || revoking ? true : undefined}
                  title={!online ? WORKSPACE_WORDS.needsConnection : undefined}
                  className={
                    !online || revoking
                      ? "cursor-not-allowed opacity-50"
                      : "cursor-pointer"
                  }
                  onClick={() => {
                    if (online && !revoking) props.onConfirmRevoke(entry);
                  }}
                >
                  {API_KEYS_WORDS.revokeNamed(entry.name)}
                </Button>
              </div>
              {refusal === null ? null : <InlineRefusal sentence={refusal} />}
            </div>
          </td>
        </tr>
      ) : null}
    </tbody>
  );
}
