// A round filter row in the Comments tab, built on shared Row with open/total tally and inline Rename.
import type { CommentRound } from "@manent/crdt";
import { COMMENTS_WORDS, DropdownMenuItem, Input, Row } from "@manent/ui";
import { PencilIcon } from "lucide-react";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { RowMenu } from "../screens/library/row-place.tsx";
import type { PersonServices } from "../services/ports.ts";
import { commentsActions } from "../state/comments.store.ts";
import type { RoundTriageStats } from "./comments-filter.ts";
import { roundTitleLabel } from "./comments-format.ts";

export function RoundRow(props: {
  docId: string;
  roundId: string;
  round: CommentRound;
  stats: RoundTriageStats;
  selected: boolean;
  canEdit: boolean;
  services: PersonServices;
  onSelect(): void;
}): ReactNode {
  const {
    docId,
    roundId,
    round,
    stats,
    selected,
    canEdit,
    services,
    onSelect,
  } = props;
  const [renaming, setRenaming] = useState(false);
  const [value, setValue] = useState(round.name);
  const inputRef = useRef<HTMLInputElement>(null);
  const title = roundTitleLabel(round);

  useLayoutEffect(() => {
    if (!renaming) return;
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, [renaming]);

  const commit = (): void => {
    const trimmed = value.trim();
    if (trimmed !== "" && trimmed !== round.name) {
      commentsActions.renameRound(docId, services, roundId, trimmed);
    }
    setRenaming(false);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      setValue(round.name);
      setRenaming(false);
    } else if (event.key === "Enter") {
      event.preventDefault();
      commit();
    }
  };

  if (renaming) {
    return (
      <div className="px-1 py-1">
        <Input
          ref={inputRef}
          aria-label={COMMENTS_WORDS.roundNameField}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={commit}
          className="h-control text-ui"
        />
      </div>
    );
  }

  const trailing =
    stats.total > 0
      ? [
          <span
            key="count"
            aria-label={COMMENTS_WORDS.roundProgress(
              stats.resolved,
              stats.total,
            )}
            className="text-micro text-fg-muted tabular-nums"
          >
            {COMMENTS_WORDS.roundOpenCount(stats.open, stats.total)}
          </span>,
        ]
      : [];

  return (
    <Row
      current={selected}
      onActivate={onSelect}
      trailing={trailing}
      menuReveal="hover"
      menu={
        canEdit ? (
          <RowMenu title={title}>
            <DropdownMenuItem
              onClick={() => {
                setValue(round.name);
                setRenaming(true);
              }}
            >
              <PencilIcon aria-hidden="true" className="size-icon shrink-0" />
              <span>{COMMENTS_WORDS.rename}</span>
            </DropdownMenuItem>
          </RowMenu>
        ) : undefined
      }
    >
      <span className="truncate">{title}</span>
    </Row>
  );
}
