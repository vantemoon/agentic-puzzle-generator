import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ASCII_SYSTEM_PROMPT } from "../src/agents/ascii/prompt.js";
import { createAsciiPuzzleTool } from "../src/agents/ascii/tool.js";

export default function asciiExtension(pi: ExtensionAPI) {
    pi.registerTool(createAsciiPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["ascii-agent"] = ASCII_SYSTEM_PROMPT;
    });
}
