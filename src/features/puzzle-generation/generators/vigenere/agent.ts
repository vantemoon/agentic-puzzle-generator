import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { VIGENERE_SYSTEM_PROMPT } from "./prompt.js";
import { createVigenerePuzzleTool } from "./tool.js";

export function createVigenereAgent() {
    return createPuzzleAgent({
        subtype: "vigenere-cipher",
        systemPrompt: VIGENERE_SYSTEM_PROMPT,
        tool: createVigenerePuzzleTool
    });
}
