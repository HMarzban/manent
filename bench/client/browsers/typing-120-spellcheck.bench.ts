import { typingScenario } from "../typing/scenario.ts";

export default typingScenario({
  id: "typing-120-spellcheck",
  pages: 120,
  browser: "chromium",
  headed: true,
  spellcheck: true,
});
