import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { TELESTICH_SYSTEM_PROMPT } from "./prompt.js";
import { createTelestichPuzzleTool } from "./tool.js";

export function createTelestichAgent() {
    return createPuzzleAgent({
        subtype: "cover-text-line-telestich",
        systemPrompt: TELESTICH_SYSTEM_PROMPT,
        tool: createTelestichPuzzleTool
    });
}
