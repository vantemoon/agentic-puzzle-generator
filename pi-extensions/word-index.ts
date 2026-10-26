import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { WORD_INDEX_SYSTEM_PROMPT } from "../src/agents/word-index/prompt.js";
import { createWordIndexPuzzleTool } from "../src/agents/word-index/tool.js";

export default function wordIndexExtension(pi: ExtensionAPI) {
    pi.registerTool(createWordIndexPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["word-index-agent"] = WORD_INDEX_SYSTEM_PROMPT;
    });
}
