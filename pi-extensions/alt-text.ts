import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ALT_TEXT_SYSTEM_PROMPT } from "../src/agents/alt-text/prompt.js";
import { createAltTextPuzzleTool } from "../src/agents/alt-text/tool.js";

export default function altTextExtension(pi: ExtensionAPI) {
  pi.registerTool(createAltTextPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["alt-text-agent"] = ALT_TEXT_SYSTEM_PROMPT;
  });
}
