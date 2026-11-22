import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { STEGANOGRAPHY_SYSTEM_PROMPT } from "./prompt.js";
import { createSteganographyPuzzleTool } from "./tool.js";

export function createSteganographyAgent() {
    return createPuzzleAgent({
        subtype: "steganography",
        systemPrompt: STEGANOGRAPHY_SYSTEM_PROMPT,
        tool: createSteganographyPuzzleTool
    });
}
