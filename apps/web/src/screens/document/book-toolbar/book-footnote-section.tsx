// Inline footnote editor inside the floating Book format bar's More text styles popover.
import { Button, DOCUMENT_WORDS, Label, Textarea } from "@manent/ui";
import { MessageSquareQuoteIcon } from "lucide-react";
import { useId } from "react";
import type { ReactNode } from "react";
import { useEnvironment, useServices } from "../../../services/context.tsx";

const W = DOCUMENT_WORDS.bookToolbar;

export function BookFootnoteSection(props: {
  readonly active: boolean;
  readonly open: boolean;
  readonly currentText: string | null;
  readonly draft: string;
  readonly onToggle: () => void;
  readonly onDraftChange: (value: string) => void;
  readonly onDone: () => void;
}): ReactNode {
  const { editor } = useServices();
  const { dom } = useEnvironment();
  const inputId = useId();

  const apply = (): void => {
    const trimmed = props.draft.trim();
    editor.run({ kind: "footnote", text: trimmed === "" ? null : trimmed });
    props.onDone();
    dom.focusPage();
  };

  return (
    <>
      <Button
        type="button"
        variant={props.active || props.open ? "secondary" : "outline"}
        size="sm"
        aria-pressed={props.active || props.open}
        className="h-control-sm w-full justify-start gap-1.5 px-2 text-meta"
        onClick={props.onToggle}
      >
        <MessageSquareQuoteIcon aria-hidden="true" className="size-3.5" />
        <span className="truncate">
          {props.currentText && props.currentText !== ""
            ? props.currentText
            : W.footnote}
        </span>
      </Button>
      {props.open ? (
        <div className="flex flex-col gap-2 rounded-control border border-line bg-subtle p-2">
          <Label htmlFor={inputId} className="text-micro font-medium">
            {W.footnoteText}
          </Label>
          <Textarea
            id={inputId}
            rows={2}
            placeholder={W.footnotePlaceholder}
            value={props.draft}
            onChange={(event) => props.onDraftChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                event.preventDefault();
                apply();
              }
            }}
            className="min-h-14 resize-none bg-raised! text-ui"
          />
          <div className="flex items-center justify-between gap-2">
            {props.active ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-control-sm text-meta text-fg-muted hover:text-danger"
                onClick={() => {
                  editor.run({ kind: "footnote", text: null });
                  props.onDone();
                  dom.focusPage();
                }}
              >
                {W.removeFootnote}
              </Button>
            ) : (
              <span />
            )}
            <Button
              type="button"
              size="sm"
              className="h-control-sm"
              onClick={apply}
            >
              {W.saveFootnote}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  );
}
