import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { CAESAR_SYSTEM_PROMPT } from "./prompt.js";
import { createCaesarPuzzleTool } from "./tool.js";

export function createCaesarAgent() {
    return createPuzzleAgent({
        subtype: "caesar-cipher",
        systemPrompt: CAESAR_SYSTEM_PROMPT,
        tool: createCaesarPuzzleTool
    });
}
