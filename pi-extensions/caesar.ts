import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { CAESAR_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/caesar-cipher/prompt.js";
import { createCaesarPuzzleTool } from "../src/features/puzzle-generation/generators/caesar-cipher/tool.js";

export default function caesarExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "caesar-agent", CAESAR_SYSTEM_PROMPT, createCaesarPuzzleTool);
}
