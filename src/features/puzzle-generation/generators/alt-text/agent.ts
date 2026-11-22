import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ALT_TEXT_SYSTEM_PROMPT } from "./prompt.js";
import { createAltTextPuzzleTool } from "./tool.js";

export function createAltTextAgent() {
    return createPuzzleAgent({
        subtype: "alt-text",
        systemPrompt: ALT_TEXT_SYSTEM_PROMPT,
        tool: createAltTextPuzzleTool
    });
}
