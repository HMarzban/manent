// What `/join/$token` draws once the server has answered: a link that gave a role opens its document, and one that
// no longer opens anything says so in the document's place.
import { Button, LINKS_WORDS, SHARING_WORDS } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { Link2OffIcon } from "lucide-react";
import { useEffect } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../empty-hero-card.tsx";
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
    <div className="min-h-0 flex-1 overflow-y-auto bg-chrome">
      <div className="flex min-h-full items-center justify-center p-6">
        <EmptyHeroCard
          icon={<Link2OffIcon aria-hidden="true" className="size-5" />}
          headingAs="h1"
          headingTabIndex={-1}
          title={LINKS_WORDS.linkUnavailable}
          description={
            outcome.reason === "link_expired"
              ? SHARING_WORDS.linkExpired
              : SHARING_WORDS.linkRevoked
          }
          actions={
            <Button
              variant="outline"
              onClick={() => void navigate({ href: "/" })}
            >
              {LINKS_WORDS.backToLibrary}
            </Button>
          }
        />
      </div>
    </div>
  );
}
