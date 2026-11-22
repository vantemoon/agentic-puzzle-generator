import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { VIGENERE_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/vigenere/prompt.js";
import { createVigenerePuzzleTool } from "../src/features/puzzle-generation/generators/vigenere/tool.js";

export default function vigenereExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "vigenere-agent", VIGENERE_SYSTEM_PROMPT, createVigenerePuzzleTool);
}
