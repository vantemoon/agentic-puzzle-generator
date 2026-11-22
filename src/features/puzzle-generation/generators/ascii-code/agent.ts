import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ASCII_SYSTEM_PROMPT } from "./prompt.js";
import { createAsciiPuzzleTool } from "./tool.js";

export function createAsciiAgent() {
    return createPuzzleAgent({
        subtype: "ascii-code",
        systemPrompt: ASCII_SYSTEM_PROMPT,
        tool: createAsciiPuzzleTool
    });
}
