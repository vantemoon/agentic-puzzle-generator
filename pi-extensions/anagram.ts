import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ANAGRAM_SYSTEM_PROMPT } from "../src/agents/anagram/prompt.js";
import { createAnagramPuzzleTool } from "../src/agents/anagram/tool.js";

export default function anagramExtension(pi: ExtensionAPI) {
  pi.registerTool(createAnagramPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["anagram-agent"] = ANAGRAM_SYSTEM_PROMPT;
  });
}
