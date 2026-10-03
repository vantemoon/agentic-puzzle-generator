import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { MORSE_AUDIO_SYSTEM_PROMPT } from "../src/agents/morse-audio/prompt.js";
import { createMorseAudioPuzzleTool } from "../src/agents/morse-audio/tool.js";

export default function morseAudioExtension(pi: ExtensionAPI) {
  pi.registerTool(createMorseAudioPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["morse-audio-agent"] = MORSE_AUDIO_SYSTEM_PROMPT;
  });
}
