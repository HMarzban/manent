import { typingScenario } from "../typing/scenario.ts";

export default typingScenario({
  id: "typing-1000-spellcheck",
  pages: 1000,
  browser: "chromium",
  headed: true,
  spellcheck: true,
});
