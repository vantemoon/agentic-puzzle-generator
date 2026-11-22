import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { STATIC_URL_SYSTEM_PROMPT } from "./prompt.js";
import { createStaticUrlPuzzleTool } from "./tool.js";

export function createStaticUrlAgent() {
    return createPuzzleAgent({
        subtype: "static-url",
        systemPrompt: STATIC_URL_SYSTEM_PROMPT,
        tool: createStaticUrlPuzzleTool
    });
}
