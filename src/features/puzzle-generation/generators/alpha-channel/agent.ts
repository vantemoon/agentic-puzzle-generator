import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ALPHA_CHANNEL_SYSTEM_PROMPT } from "./prompt.js";
import { createAlphaChannelPuzzleTool } from "./tool.js";

export function createAlphaChannelAgent() {
    return createPuzzleAgent({
        subtype: "alpha-channel",
        systemPrompt: ALPHA_CHANNEL_SYSTEM_PROMPT,
        tool: createAlphaChannelPuzzleTool
    });
}
