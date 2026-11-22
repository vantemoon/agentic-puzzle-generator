import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { NTH_WORD_SYSTEM_PROMPT } from "./prompt.js";
import { createNthWordPuzzleTool } from "./tool.js";

export function createNthWordAgent() {
    return createPuzzleAgent({
        subtype: "periodic-word-extraction",
        systemPrompt: NTH_WORD_SYSTEM_PROMPT,
        tool: createNthWordPuzzleTool
    });
}
