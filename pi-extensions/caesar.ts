import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { CAESAR_SYSTEM_PROMPT } from "../src/agents/caesar/prompt.js";
import { createCaesarPuzzleTool } from "../src/agents/caesar/tool.js";

export default function caesarExtension(pi: ExtensionAPI) {
  pi.registerTool(createCaesarPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["caesar-agent"] = CAESAR_SYSTEM_PROMPT;
  });
}