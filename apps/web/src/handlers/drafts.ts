// Command handlers for Send draft and Copy draft link.
import type { CommandHandlers } from "@manent/commands";
import { DRAFTS_WORDS } from "@manent/ui";
import { sendPath } from "../screens/send/form-ids.ts";
import { clearDraftSends, readLastSentDraftLink } from "../send-draft/sends.ts";
import type { HandlerDeps } from "./index.ts";

export function draftsHandlers(
  deps: HandlerDeps,
): Pick<CommandHandlers, "draft.send" | "draft.copyLink"> {
  return {
    "draft.send"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      if (!deps.services.commands.state("draft.send").visible) return;
      deps.dom.rememberFocus();
      deps.router.navigate(sendPath(docId, "send_draft"));
    },
    "draft.copyLink"() {
      const { docId } = deps.shellState();
      if (docId === null) return;
      if (!deps.services.commands.state("draft.copyLink").visible) {
        clearDraftSends(deps.services, docId);
        return;
      }
      const link = readLastSentDraftLink(deps.services, docId);
      if (link === null || navigator.clipboard === undefined) return;
      navigator.clipboard.writeText(`${location.origin}${link.path}`).then(
        () => {
          deps.services.messages.dismiss("draft.sent");
          deps.services.messages.push({
            id: "draft.linkCopied",
            text: DRAFTS_WORDS.copiedDraftLink(link.name),
            actions: [],
            lifetime: "brief",
            ownWork: false,
          });
        },
        () => {
          // clipboard refused: nothing copied, so nothing is said
        },
      );
    },
  };
}
