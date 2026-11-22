import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { WORD_INDEX_SYSTEM_PROMPT } from "./prompt.js";
import { createWordIndexPuzzleTool } from "./tool.js";

export function createWordIndexAgent() {
    return createPuzzleAgent({
        subtype: "cover-text-word-index-cipher",
        systemPrompt: WORD_INDEX_SYSTEM_PROMPT,
        tool: createWordIndexPuzzleTool
    });
}
