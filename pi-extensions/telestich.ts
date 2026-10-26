import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { TELESTICH_SYSTEM_PROMPT } from "../src/agents/telestich/prompt.js";
import { createTelestichPuzzleTool } from "../src/agents/telestich/tool.js";

export default function telestichExtension(pi: ExtensionAPI) {
    pi.registerTool(createTelestichPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["telestich-agent"] = TELESTICH_SYSTEM_PROMPT;
    });
}
