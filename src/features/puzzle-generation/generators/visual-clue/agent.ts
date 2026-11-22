import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { VISUAL_CLUE_SYSTEM_PROMPT } from "./prompt.js";
import { createVisualCluePuzzleTool } from "./tool.js";

export const VISUAL_CLUE_MAX_OUTPUT_TOKENS = 16_000;

export function createVisualClueAgent() {
    return createPuzzleAgent({
        subtype: "visual-clue",
        systemPrompt: VISUAL_CLUE_SYSTEM_PROMPT,
        tool: createVisualCluePuzzleTool,
        maximumOutputTokens: VISUAL_CLUE_MAX_OUTPUT_TOKENS
    });
}
