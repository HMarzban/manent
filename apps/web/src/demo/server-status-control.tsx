// Pre-shell controls, guarded Server status control, collapsed restore tab, active writers pill and hide button.
import {
  Avatar,
  Button,
  DEMO_WORDS,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  chooseStageHintFor,
} from "@manent/ui";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  PowerIcon,
  UsersIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode, RefObject } from "react";
import { initialsOf } from "../initials.ts";
import {
  useEnvironment,
  useOptionalEnvironment,
} from "../services/context.tsx";
import type { TabPerson } from "../session.ts";
import { useAnnouncer } from "../shell/announcer-region.tsx";
import { TEXT, serverStatusText } from "../text.ts";
import { BarButton } from "./bar-button.tsx";
import { useBarSurfaceSync } from "./demo-stage-hooks.ts";
import { SERVER_STATUS_QUERY, useServerState } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";

const COLLAPSED_KEY = "manent.demo.collapsed";

export function useCollapsedDemoBar(): [boolean, (next: boolean) => void] {
  const { tabStorage } = useEnvironment();
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return tabStorage?.getItem(COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
  });
  const persist = useCallback(
    (next: boolean) => {
      setCollapsed(next);
      try {
        if (next) tabStorage?.setItem(COLLAPSED_KEY, "1");
        else tabStorage?.removeItem(COLLAPSED_KEY);
      } catch {
        // storage refusing writes keeps collapsed state in memory only
      }
    },
    [tabStorage],
  );
  return [collapsed, persist];
}

export function CollapsedDemoTab(props: {
  readonly keystrokeP50: number | null;
  readonly onExpand: () => void;
}): ReactNode {
  const { keystrokeP50, onExpand } = props;
  const speedLabel =
    keystrokeP50 === null ? null : DEMO_WORDS.msShort(keystrokeP50);
  return (
    <button
      type="button"
      aria-label={DEMO_WORDS.showDemoBar}
      onClick={onExpand}
      className="mn-demo-collapsed-tab focus-visible:outline-2 focus-visible:outline-focus"
    >
      <span aria-hidden="true" className="mn-demo-dot" data-tone="ok" />
      <span>{DEMO_WORDS.demo}</span>
      {speedLabel !== null ? (
        <span className="text-fg-muted tabular-nums">{speedLabel}</span>
      ) : null}
      <ChevronDownIcon aria-hidden="true" className="size-3" />
    </button>
  );
}

export function ActiveWritersPill(props: {
  readonly count: number;
  readonly pending: boolean;
  readonly onStop: () => void;
}): ReactNode {
  const { count, pending, onStop } = props;
  return (
    <div
      className="mn-demo-pill shrink-0 pe-1 font-medium tabular-nums"
      data-tone="active"
    >
      <UsersIcon aria-hidden="true" className="size-3.5 text-fg-accent" />
      <span className="hidden md:inline">
        {DEMO_WORDS.writersTyping(count)}
      </span>
      <span className="md:hidden">{count}</span>
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        className="h-6 rounded-full px-2 text-micro"
        onClick={onStop}
      >
        {DEMO_WORDS.stop}
      </Button>
    </div>
  );
}

export function HideDemoBarButton(props: {
  readonly onHide: () => void;
}): ReactNode {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={DEMO_WORDS.hideDemoBar}
            onClick={props.onHide}
            className="hidden h-7 w-7 rounded-full text-fg-muted hover:text-fg sm:inline-flex"
          />
        }
      >
        <ChevronUpIcon aria-hidden="true" className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent className="data-closed:hidden">
        {DEMO_WORDS.hideDemoBar}
      </TooltipContent>
    </Tooltip>
  );
}

export function PreShellControls(props: {
  person: TabPerson | null;
  onPersonClick: () => void;
  control: DemoControl | null;
  resetting: boolean;
  barRef?: RefObject<HTMLElement | null>;
}): ReactNode {
  const { person, onPersonClick, control, resetting, barRef } = props;
  const onDesktop = useOptionalEnvironment()?.where.shell === "desktop";
  return (
    <div className="flex min-w-0 flex-1 flex-nowrap items-center gap-2">
      {person !== null ? (
        <Button
          variant="ghost"
          size="sm"
          data-tour="demo:person"
          aria-label={DEMO_WORDS.person(person.name)}
          onClick={onPersonClick}
          className="h-7 rounded-full px-1.5 sm:px-2"
        >
          <Avatar
            name={person.name}
            initials={initialsOf(person.name)}
            colour={null}
            size="sm"
            decorative
          />
          <span className="hidden sm:inline">{person.name}</span>
        </Button>
      ) : (
        <span className="hidden truncate text-meta text-fg-muted md:inline">
          {chooseStageHintFor(onDesktop)}
        </span>
      )}
      {control !== null ? (
        <PreShellServerSlot
          control={control}
          resetting={resetting}
          barRef={barRef}
        />
      ) : null}
    </div>
  );
}

function PreShellServerSlot(props: {
  control: DemoControl;
  resetting: boolean;
  barRef?: RefObject<HTMLElement | null>;
}): ReactNode {
  const { control, resetting, barRef } = props;
  const server = useServerState(control);
  const state = resetting ? "resetting" : server;
  const edge =
    state === "stopped" || state === "failed"
      ? "danger"
      : state === "resetting"
        ? "attention"
        : null;
  useBarSurfaceSync(barRef, edge, false);

  return (
    <div className="ms-auto flex shrink-0 items-center gap-2">
      <ServerStatusControl {...control} resetting={resetting} inline />
    </div>
  );
}

export function ServerStatusControl(
  props: DemoControl & {
    resetting: boolean;
    inline: boolean;
    onAction?: () => void;
  },
): ReactNode {
  const { client, resetting, inline, onAction } = props;
  const queryClient = useQueryClient();
  const queryKey = [SERVER_STATUS_QUERY, props.id];
  const answered = useServerState(props);
  const state = resetting ? "resetting" : answered;
  const announcer = useAnnouncer();

  const action = useMutation({
    mutationFn: (kind: "stop" | "start") =>
      kind === "stop" ? client.stop() : client.start(),
    onError: () => announcer.announce(DEMO_WORDS.serverRefused),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const known = useRef(state);
  useEffect(() => {
    const before = known.current;
    known.current = state;
    if (before !== null && state !== null && state !== before)
      announcer.announce(serverStatusText(state));
  }, [announcer, state]);

  const kind =
    state === "running"
      ? "stop"
      : state === "stopped" || state === "failed"
        ? "start"
        : null;

  if (inline) {
    return (
      <div
        data-tour="demo:server"
        className="flex min-w-0 items-center gap-1.5"
      >
        <span data-slot="bar-status" className="sr-only">
          {state && serverStatusText(state)}
        </span>
        {kind === "start" ? (
          <div className="mn-demo-pill pe-1 font-medium" data-tone="danger">
            <span
              aria-hidden="true"
              className="mn-demo-dot"
              data-tone="danger"
            />
            <span className="hidden sm:inline">{DEMO_WORDS.serverPaused}</span>
            <Button
              variant="destructive"
              size="sm"
              disabled={action.isPending}
              className="h-6 rounded-full px-2 text-micro font-semibold"
              onClick={() => action.mutate("start")}
            >
              {TEXT.startServer}
            </Button>
          </div>
        ) : kind === "stop" ? (
          <BarButton
            label={TEXT.stopServer}
            icon={PowerIcon}
            hint={DEMO_WORDS.stopServerHint}
            disabled={action.isPending}
            onClick={() => action.mutate("stop")}
          />
        ) : state !== null ? (
          <span className="truncate text-meta text-fg-muted">
            {serverStatusText(state)}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <div data-tour="demo:server" className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-meta font-medium text-fg">
        <span
          aria-hidden="true"
          className="mn-demo-dot"
          data-tone={
            state === "running"
              ? "ok"
              : state === "stopped" || state === "failed"
                ? "danger"
                : "attention"
          }
        />
        <span>
          {state === "running"
            ? DEMO_WORDS.serverLive
            : state === "stopped" || state === "failed"
              ? DEMO_WORDS.serverPaused
              : state
                ? serverStatusText(state)
                : DEMO_WORDS.serverLive}
        </span>
      </div>
      {kind !== null ? (
        <BarButton
          label={kind === "stop" ? TEXT.stopServer : TEXT.startServer}
          icon={PowerIcon}
          hint={kind === "stop" ? DEMO_WORDS.stopServerHint : undefined}
          disabled={action.isPending}
          onClick={() => {
            onAction?.();
            action.mutate(kind);
          }}
        />
      ) : null}
    </div>
  );
}
