// Inline name input with explicit Save/Cancel actions, Escape revert and case-insensitive duplicate guard.
import { Button, Input, NAMES_WORDS } from "@manent/ui";
import { useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export function NameField(props: {
  readonly label: string;
  readonly placeholder: string;
  readonly initial: string;
  readonly existingNames: readonly string[];
  readonly keepOpenAfterSave?: boolean;
  onDone(name: string | null): void;
}): ReactNode {
  const {
    label,
    placeholder,
    initial,
    existingNames,
    keepOpenAfterSave = false,
    onDone,
  } = props;
  const [value, setValue] = useState(initial);
  const [duplicate, setDuplicate] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const errorId = useId();

  useLayoutEffect(() => {
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
  }, []);

  const isDuplicate = (candidate: string): boolean => {
    const lower = candidate.toLowerCase();
    if (initial !== "" && lower === initial.trim().toLowerCase()) return false;
    return existingNames.some((n) => n.trim().toLowerCase() === lower);
  };

  const commit = (): void => {
    const trimmed = value.trim();
    if (trimmed === "") {
      onDone(null);
      return;
    }
    if (isDuplicate(trimmed)) {
      setDuplicate(NAMES_WORDS.alreadyListed(trimmed));
      inputRef.current?.focus({ preventScroll: true });
      return;
    }
    setDuplicate(null);
    onDone(trimmed);
    if (keepOpenAfterSave) {
      setValue("");
      inputRef.current?.focus({ preventScroll: true });
    }
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone(null);
      return;
    }
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    commit();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <Input
          ref={inputRef}
          aria-label={label}
          aria-invalid={duplicate !== null ? true : undefined}
          aria-describedby={duplicate !== null ? errorId : undefined}
          placeholder={placeholder}
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            if (duplicate !== null) setDuplicate(null);
          }}
          onKeyDown={onKeyDown}
          className="h-control min-w-0 flex-1 text-ui"
        />
        <Button
          type="button"
          size="sm"
          disabled={value.trim() === ""}
          onMouseDown={(event) => event.preventDefault()}
          onClick={commit}
        >
          {NAMES_WORDS.save}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onDone(null)}
        >
          {NAMES_WORDS.cancel}
        </Button>
      </div>
      {duplicate !== null ? (
        <p id={errorId} role="alert" className="text-meta text-attention">
          {duplicate}
        </p>
      ) : null}
    </div>
  );
}
