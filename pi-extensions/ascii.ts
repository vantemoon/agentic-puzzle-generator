import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ASCII_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/ascii-code/prompt.js";
import { createAsciiPuzzleTool } from "../src/features/puzzle-generation/generators/ascii-code/tool.js";

export default function asciiExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "ascii-agent", ASCII_SYSTEM_PROMPT, createAsciiPuzzleTool);
}
