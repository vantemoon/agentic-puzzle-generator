import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { MORSE_SYSTEM_PROMPT } from "../src/agents/morse/prompt.js";
import { createMorsePuzzleTool } from "../src/agents/morse/tool.js";

export default function morseExtension(pi: ExtensionAPI) {
    pi.registerTool(createMorsePuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["morse-agent"] = MORSE_SYSTEM_PROMPT;
    });
}