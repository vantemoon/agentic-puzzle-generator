import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { STATIC_URL_SYSTEM_PROMPT } from "../src/agents/static-url/prompt.js";
import { createStaticUrlPuzzleTool } from "../src/agents/static-url/tool.js";

export default function staticUrlExtension(pi: ExtensionAPI) {
  pi.registerTool(createStaticUrlPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["static-url-agent"] = STATIC_URL_SYSTEM_PROMPT;
  });
}
