// The desktop Prompter files consequence dialog: Encoding (UTF-8 / Windows-1252) and Write to with Choose….
import {
  Button,
  ConsequenceDialog,
  Input,
  Label,
  PROMPTER_FILES_WORDS,
  RadioGroup,
  RadioGroupItem,
} from "@manent/ui";
import { useEffect, useId, useState } from "react";
import type { ReactNode } from "react";
import { useDocumentTitle } from "../screens/document/title-bar.tsx";
import { useEnvironment } from "../services/context.tsx";
import { startPrompterFiles } from "./store.ts";
import type { PrompterFilesEncoding } from "./store.ts";

const WORDS = PROMPTER_FILES_WORDS;

export function PrompterFilesDialog(props: {
  readonly rundownId: string;
  onClose(): void;
}): ReactNode {
  const { rundownId, onClose } = props;
  const { desktop } = useEnvironment();
  const title = useDocumentTitle(rundownId);
  const [encoding, setEncoding] = useState<PrompterFilesEncoding>("utf-8");
  const [folder, setFolder] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);
  const encodingId = useId();
  const utf8Id = useId();
  const win1252Id = useId();
  const win1252HelpId = useId();
  const placeId = useId();

  useEffect(() => {
    setEncoding("utf-8");
    setFolder("");
    setSubmitting(false);
    setRefusal(null);
  }, [rundownId]);

  useEffect(() => {
    if (desktop === null) return undefined;
    return desktop.onMessage((message) => {
      if (message.t !== "directory_chosen" || message.path === null) return;
      setFolder(message.path);
      setRefusal(null);
    });
  }, [desktop]);

  const emptyPlace = folder.trim() === "";

  const handleChoose = (): void => {
    desktop?.send({ v: 1, t: "choose_directory" });
  };

  const handleSubmit = (): void => {
    if (submitting || emptyPlace) return;
    setSubmitting(true);
    setRefusal(null);
    void startPrompterFiles({ rundownId, folder, encoding }).then((result) => {
      setSubmitting(false);
      if (!result.ok) setRefusal(result.refusal);
    });
  };

  return (
    <ConsequenceDialog
      open
      title={WORDS.title(title)}
      body={WORDS.body}
      action={WORDS.action}
      busyLabel={submitting ? WORDS.writingAction : null}
      refusal={refusal}
      disabledReason={emptyPlace ? WORDS.emptyPlaceReason : undefined}
      destructive={false}
      onAction={handleSubmit}
      onCancel={onClose}
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <span id={encodingId} className="text-ui font-medium text-fg">
            {WORDS.encodingLabel}
          </span>
          <RadioGroup
            aria-labelledby={encodingId}
            value={encoding}
            onValueChange={(value) => {
              if (value === "utf-8" || value === "windows-1252") {
                setEncoding(value);
                setRefusal(null);
              }
            }}
          >
            <label className="flex cursor-pointer items-center gap-2 text-ui text-fg">
              <RadioGroupItem value="utf-8" aria-labelledby={utf8Id} />
              <span id={utf8Id}>{WORDS.utf8}</span>
            </label>
            <div className="flex flex-col gap-1">
              <label className="flex cursor-pointer items-center gap-2 text-ui text-fg">
                <RadioGroupItem
                  value="windows-1252"
                  aria-labelledby={win1252Id}
                  aria-describedby={win1252HelpId}
                />
                <span id={win1252Id}>{WORDS.windows1252}</span>
              </label>
              <p id={win1252HelpId} className="ps-6 text-meta text-fg-muted">
                {WORDS.windows1252Help}
              </p>
            </div>
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-1.5" data-tour="prompter_files:place">
          <Label htmlFor={placeId}>{WORDS.placeLabel}</Label>
          <div className="flex items-center gap-2">
            <Input
              id={placeId}
              type="text"
              value={folder}
              disabled={submitting}
              className="min-w-0 flex-1"
              onChange={(event) => {
                setFolder(event.target.value);
                setRefusal(null);
              }}
            />
            <Button
              type="button"
              variant="outline"
              disabled={submitting}
              aria-label={WORDS.chooseLabel}
              onClick={handleChoose}
            >
              {WORDS.choose}
            </Button>
          </div>
        </div>
      </div>
    </ConsequenceDialog>
  );
}
