// The Send draft To row: project groups, workspace people, Anyone with this link, Nobody — the file only, and no-email line.
import type { GroupEntry } from "@manent/crdt";
import type { SignInChoice } from "@manent/sync-protocol";
import {
  Button,
  DRAFTS_WORDS,
  Input,
  SHARING_WORDS,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
} from "@manent/ui";
import { XIcon } from "lucide-react";
import { useId, useState } from "react";
import type { ReactNode } from "react";

const EXPIRY_ITEMS = SHARING_WORDS.expiryChoices.map((label, i) => ({
  value: String(i),
  label,
}));

function formatGroupChip(group: GroupEntry): string {
  const count = group.memberUserIds.length;
  return group.watermark
    ? DRAFTS_WORDS.groupCountWatermarked(group.name, count)
    : DRAFTS_WORDS.groupCount(group.name, count);
}

export function ToRowContent(props: {
  groups: readonly GroupEntry[];
  people: readonly SignInChoice[];
  selectedGroupIds: readonly string[];
  selectedPeopleIds: readonly string[];
  distinctCount: number;
  linkEnabled: boolean;
  expiryIndex: number;
  askWhoTheyAre: boolean;
  nobody: boolean;
  onAddGroup(groupId: string): void;
  onRemoveGroup(groupId: string): void;
  onAddPerson(userId: string): void;
  onRemovePerson(userId: string): void;
  onLinkEnabledChange(on: boolean): void;
  onExpiryChange(index: number): void;
  onAskWhoTheyAreChange(on: boolean): void;
  onNobodyChange(on: boolean): void;
}): ReactNode {
  const {
    groups,
    people,
    selectedGroupIds,
    selectedPeopleIds,
    distinctCount,
    linkEnabled,
    expiryIndex,
    askWhoTheyAre,
    nobody,
    onAddGroup,
    onRemoveGroup,
    onAddPerson,
    onRemovePerson,
    onLinkEnabledChange,
    onExpiryChange,
    onAskWhoTheyAreChange,
    onNobodyChange,
  } = props;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const linkId = useId();
  const askId = useId();
  const askDescId = useId();
  const nobodyId = useId();

  const chosenGroups = selectedGroupIds.flatMap((id) => {
    const found = groups.find((entry) => entry.id === id);
    return found === undefined ? [] : [found];
  });
  const chosenPeople = selectedPeopleIds.flatMap((id) => {
    const found = people.find((entry) => entry.userId === id);
    return found === undefined ? [] : [found];
  });

  const term = query.trim().toLowerCase();
  const availableGroups = groups.filter(
    (entry) =>
      !selectedGroupIds.includes(entry.id) &&
      (term === "" || entry.name.toLowerCase().includes(term)),
  );
  const availablePeople = people.filter(
    (entry) =>
      !selectedPeopleIds.includes(entry.userId) &&
      (term === "" || entry.name.toLowerCase().includes(term)),
  );
  const anyMatches = availableGroups.length > 0 || availablePeople.length > 0;

  return (
    <div className="flex flex-col gap-3" data-tour="send:to">
      {chosenGroups.length > 0 || chosenPeople.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul className="flex flex-wrap gap-2">
            {chosenGroups.map((group) => (
              <li
                key={group.id}
                className="flex items-center gap-1 rounded-control border border-line bg-raised ps-2 pe-1 py-0.5 text-ui"
              >
                <span>{formatGroupChip(group)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={DRAFTS_WORDS.removeName(group.name)}
                  onClick={() => onRemoveGroup(group.id)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
            {chosenPeople.map((person) => (
              <li
                key={person.userId}
                className="flex items-center gap-1 rounded-control border border-line bg-raised ps-2 pe-1 py-0.5 text-ui"
              >
                <span>{person.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={DRAFTS_WORDS.removeName(person.name)}
                  onClick={() => onRemovePerson(person.userId)}
                >
                  <XIcon aria-hidden="true" />
                </Button>
              </li>
            ))}
          </ul>
          {distinctCount > 0 ? (
            <span className="text-meta text-fg-muted tabular-nums">
              {DRAFTS_WORDS.peopleCount(distinctCount)}
            </span>
          ) : null}
        </div>
      ) : null}

      <div className="relative max-w-sm">
        <Input
          placeholder={DRAFTS_WORDS.addPlaceholder}
          aria-label={DRAFTS_WORDS.addPlaceholder}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(event) => {
            if (event.key === "Escape") setOpen(false);
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
        />
        {open ? (
          <div
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 z-20 mt-1 max-h-56 overflow-auto rounded-surface border border-line bg-overlay p-1 shadow-overlay"
          >
            {!anyMatches ? (
              <p className="px-2 py-1 text-meta text-fg-muted">
                {DRAFTS_WORDS.noMatches}
              </p>
            ) : (
              <>
                {availableGroups.length > 0 ? (
                  <div>
                    <p className="mn-group-label pt-2">
                      {DRAFTS_WORDS.groupsHeading}
                    </p>
                    {availableGroups.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        className="flex h-control w-full cursor-pointer items-center justify-between rounded-control px-2 text-start text-ui hover:bg-subtle active:bg-control"
                        onClick={() => {
                          onAddGroup(group.id);
                          setQuery("");
                          setOpen(false);
                        }}
                      >
                        <span>{formatGroupChip(group)}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {availablePeople.length > 0 ? (
                  <div>
                    <p className="mn-group-label pt-2">
                      {DRAFTS_WORDS.peopleHeading}
                    </p>
                    {availablePeople.map((person) => (
                      <button
                        key={person.userId}
                        type="button"
                        className="flex h-control w-full cursor-pointer items-center rounded-control px-2 text-start text-ui hover:bg-subtle active:bg-control"
                        onClick={() => {
                          onAddPerson(person.userId);
                          setQuery("");
                          setOpen(false);
                        }}
                      >
                        <span>{person.name}</span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={linkId}
            checked={linkEnabled}
            onCheckedChange={onLinkEnabledChange}
          />
          <label htmlFor={linkId} className="cursor-pointer text-ui">
            {DRAFTS_WORDS.anyoneWithThisLink}
          </label>
        </div>

        {linkEnabled ? (
          <div className="ms-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-ui">
              <span className="text-fg-muted">{DRAFTS_WORDS.expires}</span>
              <Select
                items={EXPIRY_ITEMS}
                value={String(expiryIndex)}
                onValueChange={(value) => onExpiryChange(Number(value))}
              >
                <SelectTrigger aria-label={DRAFTS_WORDS.expires}>
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
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Switch
                  id={askId}
                  checked={askWhoTheyAre}
                  onCheckedChange={onAskWhoTheyAreChange}
                  aria-describedby={askDescId}
                />
                <label htmlFor={askId} className="cursor-pointer text-ui">
                  {DRAFTS_WORDS.askWhoTheyAre}
                </label>
              </div>
              <p id={askDescId} className="text-meta text-fg-muted">
                {DRAFTS_WORDS.askWhoTheyAreLine}
              </p>
            </div>
          </div>
        ) : null}

        <div className="flex items-center gap-2">
          <Switch
            id={nobodyId}
            checked={nobody}
            onCheckedChange={onNobodyChange}
          />
          <label htmlFor={nobodyId} className="cursor-pointer text-ui">
            {DRAFTS_WORDS.nobodyFileOnly}
          </label>
        </div>
      </div>

      <p className="text-meta text-fg-muted">{DRAFTS_WORDS.noEmailLine}</p>
    </div>
  );
}
