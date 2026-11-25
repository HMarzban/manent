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
import { useEffect, useId, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

type PickerOption =
  | { kind: "group"; id: string; label: string }
  | { kind: "person"; id: string; label: string };

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

function PickerSection(props: {
  heading: string;
  listboxId: string;
  options: readonly PickerOption[];
  offset: number;
  clampedIndex: number;
  onHover(index: number): void;
  onSelect(option: PickerOption): void;
}): ReactNode {
  const headingId = useId();
  if (props.options.length === 0) return null;
  return (
    <div role="group" aria-labelledby={headingId}>
      <p id={headingId} role="presentation" className="mn-group-label pt-2">
        {props.heading}
      </p>
      {props.options.map((option, local) => {
        const index = props.offset + local;
        const active = index === props.clampedIndex;
        return (
          <button
            key={option.id}
            id={`${props.listboxId}-${index}`}
            role="option"
            aria-selected={active}
            tabIndex={-1}
            type="button"
            className={`flex h-control w-full cursor-pointer items-center justify-between rounded-control px-2 text-start text-ui transition-colors hover:bg-subtle active:bg-control${active ? " bg-subtle" : ""}`}
            onMouseEnter={() => props.onHover(index)}
            onClick={() => props.onSelect(option)}
          >
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
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
    onAddGroup,
    onRemoveGroup,
    onAddPerson,
    onRemovePerson,
  } = props;

  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const pickerRef = useRef<HTMLDivElement>(null);
  const keyboardNav = useRef(false);
  const listboxId = useId();
  const linkId = useId();
  const askId = useId();
  const askDescId = useId();
  const nobodyId = useId();

  const chosenChips = [
    ...selectedGroupIds.flatMap((id) => {
      const g = groups.find((entry) => entry.id === id);
      return g === undefined
        ? []
        : [
            {
              key: `g:${g.id}`,
              label: formatGroupChip(g),
              name: g.name,
              remove: () => onRemoveGroup(g.id),
            },
          ];
    }),
    ...selectedPeopleIds.flatMap((id) => {
      const p = people.find((entry) => entry.userId === id);
      return p === undefined
        ? []
        : [
            {
              key: `p:${p.userId}`,
              label: p.name,
              name: p.name,
              remove: () => onRemovePerson(p.userId),
            },
          ];
    }),
  ];

  const term = query.trim().toLowerCase();
  const groupOptions: readonly PickerOption[] = groups
    .filter(
      (entry) =>
        !selectedGroupIds.includes(entry.id) &&
        (term === "" || entry.name.toLowerCase().includes(term)),
    )
    .map((group) => ({
      kind: "group",
      id: group.id,
      label: formatGroupChip(group),
    }));
  const personOptions: readonly PickerOption[] = people
    .filter(
      (entry) =>
        !selectedPeopleIds.includes(entry.userId) &&
        (term === "" || entry.name.toLowerCase().includes(term)),
    )
    .map((person) => ({
      kind: "person",
      id: person.userId,
      label: person.name,
    }));
  const allOptions: readonly PickerOption[] = [
    ...groupOptions,
    ...personOptions,
  ];
  const anyMatches = allOptions.length > 0;
  const clampedIndex =
    allOptions.length === 0
      ? -1
      : activeIndex >= allOptions.length
        ? 0
        : activeIndex;

  const onHoverOption = (index: number): void => {
    keyboardNav.current = false;
    setActiveIndex(index);
  };

  const selectOption = (option: PickerOption): void => {
    if (option.kind === "group") onAddGroup(option.id);
    else onAddPerson(option.id);
    setQuery("");
    setActiveIndex(-1);
    setOpen(false);
  };

  const move = (next: number): void => {
    keyboardNav.current = true;
    setOpen(true);
    setActiveIndex(allOptions.length === 0 ? -1 : next);
  };

  useEffect(() => {
    if (!open || clampedIndex < 0 || !keyboardNav.current) return;
    keyboardNav.current = false;
    const optionEl =
      pickerRef.current?.querySelectorAll<HTMLElement>("[role='option']")[
        clampedIndex
      ];
    optionEl?.scrollIntoView?.({ block: "nearest" });
  }, [open, clampedIndex]);

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    const count = allOptions.length;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      move(!open ? 0 : (clampedIndex + 1) % count);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      move(!open || clampedIndex <= 0 ? count - 1 : clampedIndex - 1);
    } else if (event.key === "Enter" && open && clampedIndex >= 0) {
      const option = allOptions[clampedIndex];
      if (option !== undefined) {
        event.preventDefault();
        selectOption(option);
      }
    } else if (event.key === "Escape" && open) {
      event.preventDefault();
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  return (
    <div className="flex flex-col gap-3" data-tour="send:to">
      {chosenChips.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <ul className="flex flex-wrap gap-2">
            {chosenChips.map((chip) => (
              <li
                key={chip.key}
                className="flex items-center gap-1 rounded-control border border-line bg-raised ps-2 pe-1 py-0.5 text-ui"
              >
                <span>{chip.label}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-xs"
                  aria-label={DRAFTS_WORDS.removeName(chip.name)}
                  onClick={chip.remove}
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

      <div
        ref={pickerRef}
        className="relative max-w-sm"
        onBlur={(event) => {
          const next = event.relatedTarget;
          if (next instanceof Node && pickerRef.current?.contains(next)) return;
          setOpen(false);
          setActiveIndex(-1);
        }}
      >
        <Input
          role="combobox"
          aria-expanded={open}
          aria-controls={open && anyMatches ? listboxId : undefined}
          aria-activedescendant={
            open && clampedIndex >= 0
              ? `${listboxId}-${clampedIndex}`
              : undefined
          }
          aria-autocomplete="list"
          placeholder={DRAFTS_WORDS.addPlaceholder}
          aria-label={DRAFTS_WORDS.addPlaceholder}
          value={query}
          onFocus={() => setOpen(true)}
          onClick={() => setOpen(true)}
          onKeyDown={onInputKeyDown}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setOpen(true);
          }}
        />
        {open ? (
          <div
            id={anyMatches ? listboxId : undefined}
            role={anyMatches ? "listbox" : undefined}
            aria-label={anyMatches ? DRAFTS_WORDS.addPlaceholder : undefined}
            onMouseDown={(event) => event.preventDefault()}
            className="absolute inset-x-0 z-20 mt-1 max-h-56 overflow-auto rounded-surface border border-line bg-overlay p-1 shadow-overlay"
          >
            {!anyMatches ? (
              <p className="px-2 py-1 text-meta text-fg-muted">
                {DRAFTS_WORDS.noMatches}
              </p>
            ) : (
              <>
                <PickerSection
                  heading={DRAFTS_WORDS.groupsHeading}
                  listboxId={listboxId}
                  options={groupOptions}
                  offset={0}
                  clampedIndex={clampedIndex}
                  onHover={onHoverOption}
                  onSelect={selectOption}
                />
                <PickerSection
                  heading={DRAFTS_WORDS.peopleHeading}
                  listboxId={listboxId}
                  options={personOptions}
                  offset={groupOptions.length}
                  clampedIndex={clampedIndex}
                  onHover={onHoverOption}
                  onSelect={selectOption}
                />
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Switch
            id={linkId}
            checked={props.linkEnabled}
            onCheckedChange={props.onLinkEnabledChange}
          />
          <label htmlFor={linkId} className="cursor-pointer text-ui">
            {DRAFTS_WORDS.anyoneWithThisLink}
          </label>
        </div>

        {props.linkEnabled ? (
          <div className="ms-6 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-ui">
              <span className="text-fg-muted">{DRAFTS_WORDS.expires}</span>
              <Select
                items={EXPIRY_ITEMS}
                value={String(props.expiryIndex)}
                onValueChange={(value) => props.onExpiryChange(Number(value))}
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
                  checked={props.askWhoTheyAre}
                  onCheckedChange={props.onAskWhoTheyAreChange}
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
            checked={props.nobody}
            onCheckedChange={props.onNobodyChange}
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
