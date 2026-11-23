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
import { useId, useState } from "react";
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
  const on = newest !== null || shown;
  const role = chosenRole ?? newest?.role ?? null;
  const expiry = chosenExpiry ?? expiryOf(newest);

  const turn = (next: boolean): void => {
    if (next) setShown(true);
    else if (newest === null) setShown(false);
    else void actions.turnOffLink();
  };

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-2">
      <h2 id={headingId} className="mn-group-label -mx-3">
        {WORDS.link}
      </h2>
      <div className="flex items-center justify-between gap-2 text-ui">
        <label htmlFor={switchId}>{WORDS.anyoneWithTheLink}</label>
        <Switch id={switchId} checked={on} onCheckedChange={turn} />
      </div>
      {on ? (
        <>
          <div className="flex items-center gap-2 text-ui">
            <RoleSelect value={role} onChange={setRole} />
            <span className="text-fg-muted">{WORDS.expires}</span>
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
          {newest === null ? null : (
            <p className="text-meta text-fg-muted">
              {newest.expiresAt === null
                ? WORDS.neverExpires
                : WORDS.expiresOn(formatDate(newest.expiresAt))}
            </p>
          )}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              aria-disabled={role === null ? true : undefined}
              aria-describedby={role === null ? reasonId : undefined}
              className="aria-disabled:text-fg-muted"
              onClick={() => {
                if (role !== null)
                  void actions.copyLink(role, LINK_EXPIRIES_MS[expiry] ?? null);
              }}
            >
              {WORDS.copyLink}
            </Button>
            {newest === null ? null : (
              <Button
                variant="ghost"
                onClick={() => void actions.turnOffLink()}
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
        </>
      ) : null}
    </section>
  );
}
