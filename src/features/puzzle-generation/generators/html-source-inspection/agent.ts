import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { SOURCE_CODE_SYSTEM_PROMPT } from "./prompt.js";
import { createSourceCodePuzzleTool } from "./tool.js";

export function createSourceCodeAgent() {
    return createPuzzleAgent({
        subtype: "html-source-inspection",
        systemPrompt: SOURCE_CODE_SYSTEM_PROMPT,
        tool: createSourceCodePuzzleTool
    });
}
