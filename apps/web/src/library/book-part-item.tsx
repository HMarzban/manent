// Library project-row menu item: "Add part" for Book projects, adding a new manuscript part to the book.
import { scriptBody } from "@manent/crdt";
import { DropdownMenuItem, LIBRARY_WORDS, useSubscribable } from "@manent/ui";
import { useNavigate } from "@tanstack/react-router";
import { FilePlus2Icon } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";
import { useLibraryAddress } from "../screens/library/library-address.ts";
import { useEnvironment, useServices } from "../services/context.tsx";

export function BookAddPartItem(props: {
  target: "project" | "folder";
  id: string;
  firstDocId: string | null;
}): ReactNode {
  const { target, id: projectId } = props;
  const services = useServices();
  const { randomId } = useEnvironment();
  const navigate = useNavigate();
  const addressWorkspace = useLibraryAddress().workspaceId;
  const workspaceId = addressWorkspace ?? services.userId;
  const projectsSource = useMemo(
    () => services.library.projects(workspaceId),
    [services.library, workspaceId],
  );
  const projects = useSubscribable(projectsSource);
  const project = projects.find((p) => p.projectId === projectId);

  if (
    target !== "project" ||
    project === undefined ||
    project.kind !== "book"
  ) {
    return null;
  }

  const handleAddPart = async (): Promise<void> => {
    const partTitle = LIBRARY_WORDS.bookPart(2);
    const created = await services.library.addCopy(
      workspaceId,
      projectId,
      "book",
      partTitle,
      {
        docKind: "script",
        airDate: null,
        rundownId: null,
        start(handle) {
          scriptBody(handle.doc()).write((w) => {
            w.insertBlocks(null, [
              {
                type: "block",
                attrs: { id: randomId(), type: "chapter" },
                content: [{ type: "text", text: partTitle }],
              },
              {
                type: "block",
                attrs: { id: randomId(), type: "body" },
              },
            ]);
          });
        },
      },
    );
    services.openScriptStore(created.docId).set("script.format", "manuscript");
    void navigate({ to: "/s/$docId", params: { docId: created.docId } });
  };

  return (
    <DropdownMenuItem onClick={() => void handleAddPart()}>
      <FilePlus2Icon aria-hidden="true" className="size-icon shrink-0" />
      {LIBRARY_WORDS.addPart}
    </DropdownMenuItem>
  );
}
