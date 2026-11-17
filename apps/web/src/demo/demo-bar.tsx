import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ServerControl } from "../api.ts";
import { TEXT, serverStatusText } from "../text.ts";

export const POLL_MS = 2000;

export function DemoBar(props: {
  personLabel: string;
  onPersonClick: () => void;
  control: { id: string; client: ServerControl } | null;
}) {
  return (
    <section
      aria-label={TEXT.demo}
      className="flex items-center gap-4 bg-neutral-900 px-4 py-2 text-sm text-white"
    >
      <span className="font-semibold">{TEXT.demo}</span>
      <button
        type="button"
        onClick={props.onPersonClick}
        className="rounded bg-neutral-700 px-2 py-1 hover:bg-neutral-600"
      >
        {props.personLabel}
      </button>
      {props.control && <ServerStatus {...props.control} />}
    </section>
  );
}

function ServerStatus(props: { id: string; client: ServerControl }) {
  const { client } = props;
  const queryClient = useQueryClient();
  const queryKey = ["server-status", props.id];

  const status = useQuery({
    queryKey,
    queryFn: client.status,
    refetchInterval: POLL_MS,
    refetchOnWindowFocus: true,
  });
  const action = useMutation({
    mutationFn: (kind: "stop" | "start") =>
      kind === "stop" ? client.stop() : client.start(),
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });

  const state = status.data;
  const kind =
    state === "running"
      ? "stop"
      : state === "stopped" || state === "failed"
        ? "start"
        : null;

  return (
    <>
      {state && (
        <p role="status" className="ml-auto">
          {serverStatusText(state)}
        </p>
      )}
      {kind && (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => action.mutate(kind)}
          className="rounded bg-white px-2 py-1 text-neutral-900 hover:bg-neutral-200"
        >
          {kind === "stop" ? TEXT.stopServer : TEXT.startServer}
        </button>
      )}
    </>
  );
}
