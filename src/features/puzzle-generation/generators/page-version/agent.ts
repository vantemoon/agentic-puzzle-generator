import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { PAGE_VERSION_SYSTEM_PROMPT } from "./prompt.js";
import { createPageVersionPuzzleTool } from "./tool.js";

export function createPageVersionAgent() {
    return createPuzzleAgent({
        subtype: "page-version",
        systemPrompt: PAGE_VERSION_SYSTEM_PROMPT,
        tool: createPageVersionPuzzleTool
    });
}
