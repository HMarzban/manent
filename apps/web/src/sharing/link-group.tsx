// The link group: anyone with the link can open the script with the role it gives, until it expires or is turned off.
import {
  Button,
  DIALOG_WORDS,
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  formatDate,
} from "@manent/ui";
import { CheckIcon, CopyIcon, Link2Icon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { RoleSelect } from "./role-select.tsx";
import { RowRefusal } from "./row-refusal.tsx";
import type { ShareActions } from "./share-actions.ts";
import { LINK_EXPIRIES_MS } from "./share-requests.ts";
import type { ShareLink, ShareRole } from "./share-requests.ts";

const WORDS = SHARING_WORDS;

const EXPIRY_ITEMS = WORDS.expiryChoices.map((label, i) => ({
  value: String(i),
  label,
}));

/** The place in the Expires list nearest to how long `link` was made to hold. */
function expiryOf(link: ShareLink | null): number {
  if (link === null || link.expiresAt === null) return 0;
  const heldMs = link.expiresAt - link.createdAt;
  const distance = (ms: number | null): number =>
    ms === null ? Number.POSITIVE_INFINITY : Math.abs(ms - heldMs);
  return LINK_EXPIRIES_MS.reduce<number>(
    (best, ms, i) =>
      distance(ms) < distance(LINK_EXPIRIES_MS[best] ?? null) ? i : best,
    0,
  );
}

export function LinkGroup(props: {
  links: readonly ShareLink[];
  refusal: string | null;
  actions: ShareActions;
}): ReactNode {
  const { actions } = props;
  const newest = props.links.at(-1) ?? null;
  const headingId = useId();
  const switchId = useId();
  const reasonId = useId();
  const [shown, setShown] = useState(false);
  const [chosenRole, setRole] = useState<ShareRole | null>(null);
  const [chosenExpiry, setExpiry] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedFeedback, setCopiedFeedback] = useState(false);
  const on = newest !== null || shown;
  const role = chosenRole ?? newest?.role ?? null;
  const expiry = chosenExpiry ?? expiryOf(newest);

  useEffect(() => {
    if (!copiedFeedback) return undefined;
    const timer = setTimeout(() => setCopiedFeedback(false), 2000);
    return () => clearTimeout(timer);
  }, [copiedFeedback]);

  const turn = (next: boolean): void => {
    if (next) {
      setShown(true);
      return;
    }
    setShown(false);
    setCopiedFeedback(false);
    if (newest !== null) {
      setBusy(true);
      void actions.turnOffLink().finally(() => setBusy(false));
    }
  };

  return (
    <section
      aria-labelledby={headingId}
      className="flex flex-col gap-3 rounded-surface border border-line bg-raised p-4"
    >
      <h2 id={headingId} className="mn-group-label p-0!">
        {WORDS.link}
      </h2>
      <div className="flex items-center justify-between gap-3 text-ui">
        <div className="flex min-w-0 items-center gap-2">
          <span
            aria-hidden="true"
            className="flex size-avatar shrink-0 items-center justify-center rounded-full border border-line bg-subtle text-fg-muted"
          >
            <Link2Icon className="size-3.5" />
          </span>
          <div className="flex min-w-0 flex-col">
            <label
              htmlFor={switchId}
              className="cursor-pointer font-medium text-fg"
            >
              {WORDS.anyoneWithTheLink}
            </label>
            {newest === null ? null : (
              <p className="text-meta text-fg-muted">
                {WORDS.linkActiveSummary(
                  WORDS.roles[newest.role],
                  newest.expiresAt === null
                    ? WORDS.neverExpires
                    : WORDS.expiresOn(formatDate(newest.expiresAt)),
                )}
              </p>
            )}
          </div>
        </div>
        <Switch id={switchId} checked={on} onCheckedChange={turn} />
      </div>
      {on ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3 animate-in fade-in-0 duration-(--dur-fast) ease-out">
          <div className="flex flex-wrap items-center gap-2 text-ui">
            <RoleSelect value={role} onChange={setRole} />
            <span className="text-meta text-fg-muted">{WORDS.expires}</span>
            <Select
              items={EXPIRY_ITEMS}
              value={String(expiry)}
              onValueChange={(value) => setExpiry(Number(value))}
            >
              <SelectTrigger aria-label={WORDS.expires}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPIRY_ITEMS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {item.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              disabled={busy}
              aria-disabled={role === null ? true : undefined}
              aria-describedby={role === null ? reasonId : undefined}
              onClick={() => {
                if (role === null || busy) return;
                setBusy(true);
                void actions
                  .copyLink(role, LINK_EXPIRIES_MS[expiry] ?? null)
                  .then((ok) => {
                    if (ok) setCopiedFeedback(true);
                  })
                  .finally(() => setBusy(false));
              }}
            >
              {copiedFeedback ? (
                <CheckIcon aria-hidden="true" className="size-icon text-ok" />
              ) : (
                <CopyIcon aria-hidden="true" className="size-icon" />
              )}
              <span>
                {copiedFeedback ? WORDS.copiedButton : WORDS.copyLink}
              </span>
            </Button>
            {newest === null ? null : (
              <Button
                variant="ghost"
                disabled={busy}
                className="text-fg-muted hover:text-danger"
                onClick={() => {
                  setShown(false);
                  setCopiedFeedback(false);
                  setBusy(true);
                  void actions.turnOffLink().finally(() => setBusy(false));
                }}
              >
                {WORDS.turnOffLink}
              </Button>
            )}
          </div>
          {role === null ? (
            <p id={reasonId} className="text-meta text-fg-muted">
              {DIALOG_WORDS.disabledLine(WORDS.copyLink, WORDS.needsRole)}
            </p>
          ) : null}
          {props.refusal === null ? null : (
            <RowRefusal sentence={props.refusal} />
          )}
        </div>
      ) : null}
    </section>
  );
}
