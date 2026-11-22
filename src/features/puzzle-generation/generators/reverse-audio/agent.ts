import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { REVERSE_AUDIO_SYSTEM_PROMPT } from "./prompt.js";
import { createReverseAudioPuzzleTool } from "./tool.js";

export function createReverseAudioAgent() {
    return createPuzzleAgent({
        subtype: "reverse-audio",
        systemPrompt: REVERSE_AUDIO_SYSTEM_PROMPT,
        tool: createReverseAudioPuzzleTool
    });
}
