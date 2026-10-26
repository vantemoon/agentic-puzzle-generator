import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { SECURE_RELAY_SYSTEM_PROMPT } from "../src/agents/secure-relay/prompt.js";
import { createSecureRelayPuzzleTool } from "../src/agents/secure-relay/tool.js";

export default function secureRelayExtension(pi: ExtensionAPI) {
    pi.registerTool(createSecureRelayPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["secure-relay-agent"] = SECURE_RELAY_SYSTEM_PROMPT;
    });
}

