import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { REVERSE_AUDIO_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/reverse-audio/prompt.js";
import { createReverseAudioPuzzleTool } from "../src/features/puzzle-generation/generators/reverse-audio/tool.js";

export default function reverseAudioExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "reverse-audio-agent", REVERSE_AUDIO_SYSTEM_PROMPT, createReverseAudioPuzzleTool);
}
