import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { PAGE_VERSION_SYSTEM_PROMPT } from "../src/agents/page-version/prompt.js";
import { createPageVersionPuzzleTool } from "../src/agents/page-version/tool.js";

export default function pageVersionExtension(pi: ExtensionAPI) {
  pi.registerTool(createPageVersionPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["page-version-agent"] = PAGE_VERSION_SYSTEM_PROMPT;
  });
}
