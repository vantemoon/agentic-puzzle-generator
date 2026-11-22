import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ASCII_ART_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/ascii-art/prompt.js";
import { createAsciiArtPuzzleTool } from "../src/features/puzzle-generation/generators/ascii-art/tool.js";

export default function asciiArtExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "ascii-art-agent", ASCII_ART_SYSTEM_PROMPT, createAsciiArtPuzzleTool);
}
