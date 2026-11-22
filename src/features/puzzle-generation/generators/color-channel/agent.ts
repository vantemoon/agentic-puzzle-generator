import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { COLOR_CHANNEL_SYSTEM_PROMPT } from "./prompt.js";
import { createColorChannelPuzzleTool } from "./tool.js";

export function createColorChannelAgent() {
    return createPuzzleAgent({
        subtype: "color-channel",
        systemPrompt: COLOR_CHANNEL_SYSTEM_PROMPT,
        tool: createColorChannelPuzzleTool
    });
}
