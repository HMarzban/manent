// Empty-folder hero card shown inside Library FolderView when a folder has no subfolders or projects.
import { CommandButton, LIBRARY_FILES_WORDS } from "@manent/ui";
import { FolderIcon } from "lucide-react";
import type { ReactNode } from "react";
import { EmptyHeroCard } from "../../empty-hero-card.tsx";

export function FolderEmptyHero(): ReactNode {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="flex min-h-full flex-col items-center justify-center p-6">
        <EmptyHeroCard
          icon={<FolderIcon aria-hidden="true" className="size-5" />}
          title={LIBRARY_FILES_WORDS.folderEmptyTitle}
          description={LIBRARY_FILES_WORDS.folderEmpty}
          actions={
            <CommandButton id="library.newFolder" variant="outline" size="sm" />
          }
        />
      </div>
    </div>
  );
}
