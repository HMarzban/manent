// What `/join/$token` draws once the server has answered: a link that gave a role opens its document, and one that
// no longer opens anything says so in the document's place.
import { SHARING_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { focusHeading } from "../focus.ts";
import { useServices } from "../services/context.tsx";
import type { PersonServices } from "../services/ports.ts";
import type { ShareJoined } from "./share-requests.ts";

/** What the server said of the link: it gave a role, or it no longer opens anything. */
export type JoinOutcome =
  | { ok: true; joined: ShareJoined }
  | { ok: false; reason: "link_expired" | "link_revoked" };

// each answer is said once, however often the screen's effect runs for it
const said = new WeakSet<ShareJoined>();

/** Says the role now held once the document's title is known; the link gave none, or a higher one was held: nothing. */
function sayJoined(services: PersonServices, joined: ShareJoined): void {
  const { role } = joined;
  if (!joined.joined || role === "owner" || said.has(joined)) return;
  said.add(joined);
  const say = (title: string): void =>
    services.messages.push({
      id: "share.joined",
      text: SHARING_WORDS.joined(role, title),
      actions: [],
      lifetime: "brief",
      ownWork: false,
    });
  const title = services.library.documentTitle(joined.docId);
  const known = title.get();
  if (known !== null) {
    say(known);
    return;
  }
  // the title arrives with the person's index, once the new role reaches their device
  const stop = title.subscribe((shown) => {
    if (shown === null) return;
    stop();
    say(shown);
  });
}

export function JoinScreen(props: { outcome: JoinOutcome }): ReactNode {
  const { outcome } = props;
  const services = useServices();
  const navigate = useNavigate();
  useEffect(() => {
    if (!outcome.ok) {
      focusHeading(document);
      return;
    }
    sayJoined(services, outcome.joined);
    void navigate({ href: `/s/${outcome.joined.docId}`, replace: true });
  }, [outcome, services, navigate]);
  if (outcome.ok) return null;
  return (
    <div className="flex flex-col items-start gap-2 p-6">
      <h1 tabIndex={-1} className="text-ui font-normal text-fg outline-none">
        {outcome.reason === "link_expired"
          ? SHARING_WORDS.linkExpired
          : SHARING_WORDS.linkRevoked}
      </h1>
    </div>
  );
}
