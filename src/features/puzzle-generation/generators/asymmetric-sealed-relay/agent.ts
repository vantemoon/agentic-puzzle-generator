import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { SECURE_RELAY_SYSTEM_PROMPT } from "./prompt.js";
import { createSecureRelayPuzzleTool } from "./tool.js";

export function createSecureRelayAgent() {
    return createPuzzleAgent({
        subtype: "asymmetric-sealed-relay",
        systemPrompt: SECURE_RELAY_SYSTEM_PROMPT,
        tool: createSecureRelayPuzzleTool
    });
}
