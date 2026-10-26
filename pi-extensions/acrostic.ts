import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ACROSTIC_SYSTEM_PROMPT } from "../src/agents/acrostic/prompt.js";
import { createAcrosticPuzzleTool } from "../src/agents/acrostic/tool.js";

export default function acrosticExtension(pi: ExtensionAPI) {
    pi.registerTool(createAcrosticPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["acrostic-agent"] = ACROSTIC_SYSTEM_PROMPT;
    });
}
