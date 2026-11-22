import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { MORSE_SYSTEM_PROMPT } from "./prompt.js";
import { createMorsePuzzleTool } from "./tool.js";

export function createMorseAgent() {
    return createPuzzleAgent({
        subtype: "morse-code",
        systemPrompt: MORSE_SYSTEM_PROMPT,
        tool: createMorsePuzzleTool
    });
}
