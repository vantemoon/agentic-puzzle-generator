import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { NTH_CHARACTER_SYSTEM_PROMPT } from "./prompt.js";
import { createNthCharacterPuzzleTool } from "./tool.js";

export function createNthCharacterAgent() {
    return createPuzzleAgent({
        subtype: "periodic-letter-extraction",
        systemPrompt: NTH_CHARACTER_SYSTEM_PROMPT,
        tool: createNthCharacterPuzzleTool
    });
}
