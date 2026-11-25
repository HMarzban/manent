// The head of a Library view other than Continue: its name, then what it lists or why it lists nothing.
import { LIBRARY_WORDS } from "@manent/ui";
import { LockIcon, SearchXIcon, StarIcon, Trash2Icon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";

function iconForHeading(heading: string): ReactNode {
  if (heading === LIBRARY_WORDS.privateHeading) {
    return <LockIcon aria-hidden="true" className="size-5" />;
  }
  if (heading === LIBRARY_WORDS.favouritesHeading) {
    return <StarIcon aria-hidden="true" className="size-5" />;
  }
  if (heading === LIBRARY_WORDS.trashHeading) {
    return <Trash2Icon aria-hidden="true" className="size-5" />;
  }
  return <SearchXIcon aria-hidden="true" className="size-5" />;
}

/** `heading` names the view; `children` follow it, and `sentence` says why the view lists nothing, or is null. */
export function LibraryViewSection(props: {
  heading: string;
  sentence: string | null;
  children?: ReactNode;
}): ReactNode {
  const { heading, sentence, children } = props;
  return (
    <section aria-label={heading} className="flex min-h-0 flex-1 flex-col">
      {sentence === null ? (
        <>
          <h2 className="mn-group-label">{heading}</h2>
          {children}
        </>
      ) : (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-h-full flex-col items-center justify-center p-6">
              <EmptyHeroCard
                headingAs="h2"
                icon={iconForHeading(heading)}
                title={heading}
                description={sentence}
              />
            </div>
          </div>
          {children}
        </>
      )}
    </section>
  );
}
