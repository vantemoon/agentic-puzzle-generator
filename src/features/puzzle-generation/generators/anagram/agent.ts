import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ANAGRAM_SYSTEM_PROMPT } from "./prompt.js";
import { createAnagramPuzzleTool } from "./tool.js";

export function createAnagramAgent() {
    return createPuzzleAgent({
        subtype: "anagram",
        systemPrompt: ANAGRAM_SYSTEM_PROMPT,
        tool: createAnagramPuzzleTool
    });
}
