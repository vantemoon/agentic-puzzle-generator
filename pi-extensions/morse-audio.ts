import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { MORSE_AUDIO_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/morse-audio/prompt.js";
import { createMorseAudioPuzzleTool } from "../src/features/puzzle-generation/generators/morse-audio/tool.js";

export default function morseAudioExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "morse-audio-agent", MORSE_AUDIO_SYSTEM_PROMPT, createMorseAudioPuzzleTool);
}
