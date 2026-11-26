// Private view: personal projects and scripts kept in the person's private index, visible only until shared.
import {
  Button,
  CommandButton,
  LIBRARY_FILES_WORDS,
  LIBRARY_WORDS,
  NEW_PROJECT_CARDS,
  SHARING_WORDS,
  useSubscribable,
} from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { LockIcon, XIcon } from "lucide-react";
import { useEffect, useId, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";
import { useEnvironment, useServices } from "../../services/context.tsx";
import type { ProjectKind } from "../../services/ports.ts";
import {
  createPrivateProject,
  privateProjectPicker,
  watchPrivateFolder,
} from "../../services/sync/private-folder.ts";
import { KindIcon } from "./project-kind.tsx";
import { ProjectList } from "./project-list.tsx";
import type { LibraryViewProps } from "./views.ts";

function PrivateKindPicker(props: {
  readonly open: (docId: string) => void;
}): ReactNode {
  const { userId, favourites } = useServices();
  const { language, now, randomId } = useEnvironment();
  const [creating, setCreating] = useState(false);
  const id = useId();

  const create = async (kind: ProjectKind): Promise<void> => {
    setCreating(true);
    try {
      const { docId } = await createPrivateProject({
        client: favourites.client,
        userId,
        kind,
        language,
        now,
        newId: randomId,
      });
      privateProjectPicker.close();
      props.open(docId);
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-surface border border-line bg-overlay p-4 shadow-overlay">
      <div className="flex items-center justify-between gap-2">
        <span className="text-title">{LIBRARY_WORDS.newProject}</span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={SHARING_WORDS.close}
          onClick={() => privateProjectPicker.close()}
        >
          <XIcon aria-hidden="true" className="size-icon" />
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {NEW_PROJECT_CARDS.map((card) => (
          <button
            key={card.kind}
            type="button"
            aria-labelledby={`${id}-${card.kind}`}
            aria-describedby={`${id}-${card.kind}-line`}
            disabled={creating}
            onClick={() => void create(card.kind)}
            className="mn-card flex flex-col items-start gap-1 p-3 text-start disabled:text-fg-disabled"
          >
            <span className="flex items-center gap-2">
              <KindIcon
                kind={card.kind}
                className="size-icon-lg text-fg-muted"
              />
              <span id={`${id}-${card.kind}`} className="text-ui font-medium">
                {card.label}
              </span>
            </span>
            <span
              id={`${id}-${card.kind}-line`}
              className="text-meta text-fg-muted"
            >
              {card.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PrivateView(_props: LibraryViewProps): ReactNode {
  const { userId, favourites } = useServices();
  const { where, now } = useEnvironment();
  const navigate = useNavigate();

  const source = useMemo(
    () => watchPrivateFolder(favourites.client, userId),
    [favourites.client, userId],
  );
  const privateProjects = useSubscribable(source);
  const pickerOpen = useSubscribable(privateProjectPicker.isOpen);

  useEffect(() => () => privateProjectPicker.close(), []);

  const open = (docId: string): void => {
    void navigate({ href: `/s/${docId}` });
  };

  const empty = privateProjects.length === 0;
  return (
    <section
      aria-label={LIBRARY_FILES_WORDS.privateHeading}
      className="flex min-h-0 flex-1 flex-col gap-6"
    >
      {empty && !pickerOpen ? null : (
        <div className="flex flex-col gap-1">
          <h2 className="text-heading">{LIBRARY_FILES_WORDS.privateHeading}</h2>
          <p className="text-ui text-fg-muted">
            {LIBRARY_FILES_WORDS.privateNote}
          </p>
        </div>
      )}
      {pickerOpen ? <PrivateKindPicker open={open} /> : null}
      {empty ? (
        pickerOpen ? null : (
          <div className="min-h-0 flex-1 overflow-y-auto">
            <div className="flex min-h-full flex-col items-center justify-center p-6">
              <EmptyHeroCard
                headingAs="h2"
                icon={<LockIcon aria-hidden="true" className="size-5" />}
                title={LIBRARY_FILES_WORDS.privateHeading}
                description={LIBRARY_FILES_WORDS.privateEmpty}
                actions={
                  <CommandButton id="library.newScript" variant="outline" />
                }
              />
            </div>
          </div>
        )
      ) : (
        <ProjectList
          projects={privateProjects}
          shell={where.shell}
          now={now()}
          open={open}
        />
      )}
    </section>
  );
}
