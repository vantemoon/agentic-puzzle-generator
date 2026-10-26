import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { REVERSE_AUDIO_SYSTEM_PROMPT } from "../src/agents/reverse-audio/prompt.js";
import { createReverseAudioPuzzleTool } from "../src/agents/reverse-audio/tool.js";

export default function reverseAudioExtension(pi: ExtensionAPI) {
  pi.registerTool(createReverseAudioPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["reverse-audio-agent"] = REVERSE_AUDIO_SYSTEM_PROMPT;
  });
}
