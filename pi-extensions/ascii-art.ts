import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ASCII_ART_SYSTEM_PROMPT } from "../src/agents/ascii-art/prompt.js";
import { createAsciiArtPuzzleTool } from "../src/agents/ascii-art/tool.js";

export default function asciiArtExtension(pi: ExtensionAPI) {
  pi.registerTool(createAsciiArtPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["ascii-art-agent"] = ASCII_ART_SYSTEM_PROMPT;
  });
}
