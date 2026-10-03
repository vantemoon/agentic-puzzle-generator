import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ALPHA_CHANNEL_SYSTEM_PROMPT } from "../src/agents/alpha-channel/prompt.js";
import { createAlphaChannelPuzzleTool } from "../src/agents/alpha-channel/tool.js";

export default function alphaChannelExtension(pi: ExtensionAPI) {
  pi.registerTool(createAlphaChannelPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["alpha-channel-agent"] = ALPHA_CHANNEL_SYSTEM_PROMPT;
  });
}
