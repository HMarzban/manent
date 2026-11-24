// Prompter authority: manual and automatic sends, HTTP routes and the live prompter feed.
export { answerPrompterRequest } from "../http/routes/prompter.ts";
export { createPrompterService } from "./service.ts";
export type {
  PrompterOutcome,
  PrompterRefusal,
  PrompterService,
  PrompterServiceOptions,
} from "./service.ts";
export { createPrompterFeedHub, subscribePrompter } from "./subscribe.ts";
export type { PrompterFeedHub, UpstreamPrompterFeed } from "./subscribe.ts";
