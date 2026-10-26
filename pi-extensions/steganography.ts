import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { STEGANOGRAPHY_SYSTEM_PROMPT } from "../src/agents/steganography/prompt.js";
import { createSteganographyPuzzleTool } from "../src/agents/steganography/tool.js";

export default function steganographyExtension(pi: ExtensionAPI) {
  pi.registerTool(createSteganographyPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["steganography-agent"] = STEGANOGRAPHY_SYSTEM_PROMPT;
  });
}
