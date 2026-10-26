import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { VIGENERE_SYSTEM_PROMPT } from "../src/agents/vigenere/prompt.js";
import { createVigenerePuzzleTool } from "../src/agents/vigenere/tool.js";

export default function vigenereExtension(pi: ExtensionAPI) {
    pi.registerTool(createVigenerePuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["vigenere-agent"] = VIGENERE_SYSTEM_PROMPT;
    });
}
