import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { MORSE_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/morse-code/prompt.js";
import { createMorsePuzzleTool } from "../src/features/puzzle-generation/generators/morse-code/tool.js";

export default function morseExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "morse-agent", MORSE_SYSTEM_PROMPT, createMorsePuzzleTool);
}
