import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { COLOR_CHANNEL_SYSTEM_PROMPT } from "../src/agents/color-channel/prompt.js";
import { createColorChannelPuzzleTool } from "../src/agents/color-channel/tool.js";

export default function colorChannelExtension(pi: ExtensionAPI) {
  pi.registerTool(createColorChannelPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["color-channel-agent"] = COLOR_CHANNEL_SYSTEM_PROMPT;
  });
}
