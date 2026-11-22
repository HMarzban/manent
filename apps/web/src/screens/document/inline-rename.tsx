// The title, renamed in place: Enter keeps the new name, Escape keeps the old one.
import { Input, useCommandState } from "@manent/ui";
import { useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { useServices } from "../../services/context.tsx";
import { renameActions } from "../../state/rename.store.ts";

/** Opens holding `title`, all selected; a name left empty or unchanged writes nothing. */
export function InlineRename(props: {
  docId: string;
  title: string;
}): ReactNode {
  const { docId, title } = props;
  const { library } = useServices();
  const { label } = useCommandState("doc.rename");
  const [value, setValue] = useState(title);
  const input = useRef<HTMLInputElement>(null);
  useLayoutEffect(() => {
    input.current?.focus({ preventScroll: true });
    input.current?.select();
  }, []);
  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key === "Escape") {
      renameActions.stop();
      return;
    }
    if (event.key !== "Enter") return;
    event.preventDefault();
    const name = value.trim();
    if (name !== "" && name !== title) library.renameDocument(docId, name);
    renameActions.stop();
  };
  return (
    <Input
      ref={input}
      aria-label={label}
      value={value}
      onChange={(event) => setValue(event.target.value)}
      onKeyDown={onKeyDown}
      className="h-control text-title font-semibold"
    />
  );
}
