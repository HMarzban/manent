// Filter ▾ menu for Library search: Kind (Documents + Projects), Changed, and Folder groups.
import {
  Button,
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  SEARCH_WORDS,
} from "@manent/ui";
import {
  CalendarIcon,
  ChevronDownIcon,
  ClockIcon,
  FileTextIcon,
  FolderIcon,
  FolderKanbanIcon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { folderPathNames } from "../services/sync/folders.ts";
import type { FolderEntry } from "../services/sync/folders.ts";
import {
  SEARCHABLE_DOC_KINDS,
  SEARCHABLE_PROJECT_KINDS,
  changedPresetDate,
  parseClientQuery,
  setQueryOperator,
} from "./search-query.ts";
import type { ChangedPreset } from "./search-query.ts";

const CHANGED_PRESETS: readonly {
  readonly id: ChangedPreset;
  readonly label: string;
}[] = Object.freeze([
  { id: "today", label: SEARCH_WORDS.changed.today },
  { id: "last7", label: SEARCH_WORDS.changed.last7 },
  { id: "last30", label: SEARCH_WORDS.changed.last30 },
  { id: "thisYear", label: SEARCH_WORDS.changed.thisYear },
]);

export interface SearchFilterMenuProps {
  readonly query: string;
  readonly folders: readonly FolderEntry[];
  readonly now: () => number;
  readonly onChangeQuery: (next: string) => void;
}

/** Filter ▾ dropdown above Library search results; every choice edits the typed query operators. */
export function SearchFilterMenu(props: SearchFilterMenuProps): ReactNode {
  const { query, folders, now, onChangeQuery } = props;
  const [open, setOpen] = useState(false);
  const parsed = useMemo(() => parseClientQuery(query), [query]);
  const nowMs = now();
  const presetDates = useMemo(
    () =>
      CHANGED_PRESETS.map((preset) => ({
        ...preset,
        date: changedPresetDate(nowMs, preset.id),
      })),
    [nowMs],
  );
  const folderOptions = useMemo(
    () =>
      folders
        .map((folder) => ({
          id: folder.id,
          name: folder.name,
          label: SEARCH_WORDS.folderPath(folderPathNames(folders, folder.id)),
        }))
        .toSorted((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" }),
        ),
    [folders],
  );

  const chooseType = (value: string | null): void => {
    setOpen(false);
    onChangeQuery(setQueryOperator(query, "type", value));
  };
  const chooseAfter = (value: string | null): void => {
    setOpen(false);
    onChangeQuery(setQueryOperator(query, "after", value));
  };
  const chooseFolder = (value: string | null): void => {
    setOpen(false);
    onChangeQuery(setQueryOperator(query, "folder", value));
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            data-tour="search:filter"
            className="shrink-0 cursor-pointer"
          />
        }
      >
        <SlidersHorizontalIcon
          aria-hidden="true"
          data-icon="inline-start"
          className="size-icon text-fg-muted"
        />
        {SEARCH_WORDS.filterButton}
        <ChevronDownIcon
          aria-hidden="true"
          data-icon="inline-end"
          className="size-icon text-fg-muted"
        />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="max-h-96 min-w-52 overflow-y-auto"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {SEARCH_WORDS.filterGroups.kind}
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={parsed.activeType === null}
            className="cursor-pointer"
            onClick={() => chooseType(null)}
          >
            {SEARCH_WORDS.anyKind}
          </DropdownMenuCheckboxItem>
          <DropdownMenuLabel className="pt-1 text-meta font-normal text-fg-muted">
            {SEARCH_WORDS.documentsSubheading}
          </DropdownMenuLabel>
          {SEARCHABLE_DOC_KINDS.map((kind) => (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={parsed.activeType === kind}
              className="cursor-pointer"
              onClick={() => chooseType(kind)}
            >
              <FileTextIcon aria-hidden="true" className="size-icon shrink-0" />
              {SEARCH_WORDS.docKinds[kind]}
            </DropdownMenuCheckboxItem>
          ))}
          <DropdownMenuLabel className="pt-1 text-meta font-normal text-fg-muted">
            {SEARCH_WORDS.projectsSubheading}
          </DropdownMenuLabel>
          {SEARCHABLE_PROJECT_KINDS.map((kind) => (
            <DropdownMenuCheckboxItem
              key={kind}
              checked={parsed.activeType === kind}
              className="cursor-pointer"
              onClick={() => chooseType(kind)}
            >
              <FolderKanbanIcon
                aria-hidden="true"
                className="size-icon shrink-0"
              />
              {SEARCH_WORDS.projectKinds[kind]}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {SEARCH_WORDS.filterGroups.changed}
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={parsed.activeAfter === null}
            className="cursor-pointer"
            onClick={() => chooseAfter(null)}
          >
            <ClockIcon aria-hidden="true" className="size-icon shrink-0" />
            {SEARCH_WORDS.changed.any}
          </DropdownMenuCheckboxItem>
          {presetDates.map((preset) => (
            <DropdownMenuCheckboxItem
              key={preset.id}
              checked={parsed.activeAfter === preset.date}
              className="cursor-pointer"
              onClick={() => chooseAfter(preset.date)}
            >
              <CalendarIcon aria-hidden="true" className="size-icon shrink-0" />
              {preset.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          <DropdownMenuLabel>
            {SEARCH_WORDS.filterGroups.folder}
          </DropdownMenuLabel>
          <DropdownMenuCheckboxItem
            checked={parsed.activeFolder === null}
            className="cursor-pointer"
            onClick={() => chooseFolder(null)}
          >
            <FolderIcon aria-hidden="true" className="size-icon shrink-0" />
            {SEARCH_WORDS.anyFolder}
          </DropdownMenuCheckboxItem>
          {folderOptions.map((folder) => (
            <DropdownMenuCheckboxItem
              key={folder.id}
              checked={
                parsed.activeFolder !== null &&
                parsed.activeFolder.toLocaleLowerCase() ===
                  folder.name.toLocaleLowerCase()
              }
              className="cursor-pointer"
              onClick={() => chooseFolder(folder.name)}
            >
              <FolderIcon aria-hidden="true" className="size-icon shrink-0" />
              {folder.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
