// Sub-components for Workspace settings -> Notifications: owner adapter cards, member read-only rows, and refusals.
import type {
  NotificationAdapter,
  NotificationAdapterStatus,
} from "@manent/sync-protocol";
import {
  Button,
  Input,
  NOTIFICATIONS_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  WORKSPACE_WORDS,
  formatTime,
} from "@manent/ui";
import { TriangleExclamationPointIcon } from "lucide-react";
import { useId } from "react";
import type { FormEvent, ReactNode } from "react";

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

function StatusLabel(props: { on: boolean }): ReactNode {
  return (
    <span
      className={
        props.on ? "text-meta font-medium text-ok" : "text-meta text-fg-muted"
      }
    >
      {props.on ? NOTIFICATIONS_WORDS.on : NOTIFICATIONS_WORDS.off}
    </span>
  );
}

function GuardedButton(props: {
  label: string;
  type: "button" | "submit";
  variant: "default" | "outline";
  size?: "default" | "sm";
  disabled: boolean;
  reason?: string;
  onClick?: () => void;
}): ReactNode {
  const button = (
    <Button
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

function DeliveryStatusLine(props: {
  status: NotificationAdapterStatus;
}): ReactNode {
  const { state, nextTryAt } = props.status;
  if (state === "retrying" && nextTryAt !== null) {
    return (
      <p className="flex items-center gap-1 text-meta text-fg">
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-attention"
        />
        {NOTIFICATIONS_WORDS.retrying(formatTime(nextTryAt))}
      </p>
    );
  }
  if (state === "stopped") {
    return (
      <p className="flex items-center gap-1 text-meta text-fg">
        <TriangleExclamationPointIcon
          aria-hidden="true"
          className="size-icon shrink-0 text-attention"
        />
        {NOTIFICATIONS_WORDS.stopped}
      </p>
    );
  }
  return null;
}

export function MemberAdapterRow(props: {
  status: NotificationAdapterStatus;
}): ReactNode {
  const label = NOTIFICATIONS_WORDS.adapters[props.status.adapter];
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <span className="text-ui font-medium text-fg">{label}</span>
      <StatusLabel on={props.status.on} />
    </div>
  );
}

export function OwnerAdapterCard(props: {
  status: NotificationAdapterStatus;
  draft: string;
  busy: boolean;
  online: boolean;
  refusal: string | null;
  onDraftChange(adapter: NotificationAdapter, value: string): void;
  onSave(adapter: NotificationAdapter): void;
  onRemove(adapter: NotificationAdapter): void;
}): ReactNode {
  const { status, draft, busy, online, refusal } = props;
  const inputId = useId();
  const adapter = status.adapter;
  const label = NOTIFICATIONS_WORDS.adapters[adapter];
  const unavailableEmail = adapter === "email" && !status.available;
  const saveDisabled = !online || busy || draft.trim().length === 0;
  const saveReason = !online ? WORKSPACE_WORDS.needsConnection : undefined;

  const handleSubmit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (unavailableEmail || saveDisabled) return;
    props.onSave(adapter);
  };

  return (
    <div className="flex flex-col gap-3 rounded-surface border border-line bg-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-ui font-semibold text-fg">{label}</h3>
          <StatusLabel on={unavailableEmail ? false : status.on} />
        </div>
        {!unavailableEmail && status.on ? (
          <GuardedButton
            label={NOTIFICATIONS_WORDS.remove}
            type="button"
            variant="outline"
            size="sm"
            disabled={!online || busy}
            reason={!online ? WORKSPACE_WORDS.needsConnection : undefined}
            onClick={() => props.onRemove(adapter)}
          />
        ) : null}
      </div>

      {unavailableEmail ? (
        <p className="text-ui text-fg-muted">
          {NOTIFICATIONS_WORDS.emailUnavailable}
        </p>
      ) : (
        <>
          {status.on && status.hint !== null ? (
            <p className="text-meta text-fg-muted">
              {NOTIFICATIONS_WORDS.goesTo(status.hint)}
            </p>
          ) : null}

          <DeliveryStatusLine status={status} />

          <form onSubmit={handleSubmit} className="flex flex-col gap-2">
            <label htmlFor={inputId} className="text-meta font-medium text-fg">
              {NOTIFICATIONS_WORDS.addressLabel}
            </label>
            <div className="flex flex-wrap items-center gap-2">
              <Input
                id={inputId}
                type="text"
                value={draft}
                aria-label={NOTIFICATIONS_WORDS.addressAriaLabel(label)}
                placeholder={NOTIFICATIONS_WORDS.placeholders[adapter]}
                disabled={!online || busy}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) =>
                  props.onDraftChange(adapter, event.currentTarget.value)
                }
                className="min-w-0 flex-1 border-line-strong bg-well text-ui text-fg"
              />
              <GuardedButton
                label={
                  busy ? NOTIFICATIONS_WORDS.saving : NOTIFICATIONS_WORDS.save
                }
                type="submit"
                variant="default"
                disabled={saveDisabled}
                reason={saveReason}
              />
            </div>
            {refusal === null ? null : <InlineRefusal sentence={refusal} />}
          </form>
        </>
      )}

      {adapter === "slack" ? (
        <p className="text-meta text-fg-muted">
          {NOTIFICATIONS_WORDS.slackCaveat}
        </p>
      ) : null}
    </div>
  );
}
