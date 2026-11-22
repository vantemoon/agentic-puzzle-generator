import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { BINARY_CAPITALIZATION_SYSTEM_PROMPT } from "./prompt.js";
import { createBinaryCapitalizationPuzzleTool } from "./tool.js";

export function createBinaryCapitalizationAgent() {
    return createPuzzleAgent({
        subtype: "binary-capitalization-pattern",
        systemPrompt: BINARY_CAPITALIZATION_SYSTEM_PROMPT,
        tool: createBinaryCapitalizationPuzzleTool
    });
}
