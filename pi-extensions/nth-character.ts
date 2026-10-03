import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { NTH_CHARACTER_SYSTEM_PROMPT } from "../src/agents/nth-character/prompt.js";
import { createNthCharacterPuzzleTool } from "../src/agents/nth-character/tool.js";

export default function nthCharacterExtension(pi: ExtensionAPI) {
    pi.registerTool(createNthCharacterPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["nth-character-agent"] =
            NTH_CHARACTER_SYSTEM_PROMPT;
    });
}
