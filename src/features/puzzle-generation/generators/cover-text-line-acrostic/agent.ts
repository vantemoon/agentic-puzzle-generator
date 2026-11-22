import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ACROSTIC_SYSTEM_PROMPT } from "./prompt.js";
import { createAcrosticPuzzleTool } from "./tool.js";

export function createAcrosticAgent() {
    return createPuzzleAgent({
        subtype: "cover-text-line-acrostic",
        systemPrompt: ACROSTIC_SYSTEM_PROMPT,
        tool: createAcrosticPuzzleTool
    });
}
