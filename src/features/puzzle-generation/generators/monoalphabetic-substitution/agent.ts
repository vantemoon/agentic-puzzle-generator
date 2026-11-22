import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { SUBSTITUTION_SYSTEM_PROMPT } from "./prompt.js";
import { createSubstitutionPuzzleTool } from "./tool.js";

export function createSubstitutionAgent() {
    return createPuzzleAgent({
        subtype: "monoalphabetic-substitution",
        systemPrompt: SUBSTITUTION_SYSTEM_PROMPT,
        tool: createSubstitutionPuzzleTool
    });
}
