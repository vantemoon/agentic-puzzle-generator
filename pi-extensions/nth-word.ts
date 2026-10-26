import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { NTH_WORD_SYSTEM_PROMPT } from "../src/agents/nth-word/prompt.js";
import { createNthWordPuzzleTool } from "../src/agents/nth-word/tool.js";

export default function nthWordExtension(pi: ExtensionAPI) {
    pi.registerTool(createNthWordPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["nth-word-agent"] = NTH_WORD_SYSTEM_PROMPT;
    });
}
