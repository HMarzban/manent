import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TEXT, serverStatusText } from "../text.ts";
import { POLL_MS, SERVER_STATUS_QUERY } from "./use-demo.ts";
import type { DemoControl } from "./use-demo.ts";

export function DemoBar(props: {
  personLabel: string;
  onPersonClick: () => void;
  control: DemoControl | null;
}) {
  return (
    <section
      aria-label={TEXT.demo}
      className="flex items-center gap-4 px-4 py-2 text-ui text-fg"
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

function ServerStatus(props: DemoControl) {
  const { client } = props;
  const queryClient = useQueryClient();
  const queryKey = [SERVER_STATUS_QUERY, props.id];

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
      {/* rendered before the first answer: a live region that appears together with its text is not announced */}
      <p role="status" className="ml-auto">
        {state && serverStatusText(state)}
      </p>
      {kind && (
        <button
          type="button"
          disabled={action.isPending}
          onClick={() => action.mutate(kind)}
          className="rounded bg-chrome px-2 py-1 text-fg hover:bg-subtle"
        >
          {kind === "stop" ? TEXT.stopServer : TEXT.startServer}
        </button>
      )}
    </>
  );
}
