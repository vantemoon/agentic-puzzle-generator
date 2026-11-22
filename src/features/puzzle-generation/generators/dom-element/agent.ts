import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { DOM_ELEMENT_SYSTEM_PROMPT } from "./prompt.js";
import { createDomElementPuzzleTool } from "./tool.js";

export function createDomElementAgent() {
    return createPuzzleAgent({
        subtype: "dom-element",
        systemPrompt: DOM_ELEMENT_SYSTEM_PROMPT,
        tool: createDomElementPuzzleTool
    });
}
