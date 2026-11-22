import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ASCII_ART_SYSTEM_PROMPT } from "./prompt.js";
import { createAsciiArtPuzzleTool } from "./tool.js";

export function createAsciiArtAgent() {
    return createPuzzleAgent({
        subtype: "ascii-art",
        systemPrompt: ASCII_ART_SYSTEM_PROMPT,
        tool: createAsciiArtPuzzleTool
    });
}
