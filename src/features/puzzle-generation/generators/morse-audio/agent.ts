import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { MORSE_AUDIO_SYSTEM_PROMPT } from "./prompt.js";
import { createMorseAudioPuzzleTool } from "./tool.js";

export function createMorseAudioAgent() {
    return createPuzzleAgent({
        subtype: "morse-audio",
        systemPrompt: MORSE_AUDIO_SYSTEM_PROMPT,
        tool: createMorseAudioPuzzleTool
    });
}
