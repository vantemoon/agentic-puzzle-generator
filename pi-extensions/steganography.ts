import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { STEGANOGRAPHY_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/steganography/prompt.js";
import { createSteganographyPuzzleTool } from "../src/features/puzzle-generation/generators/steganography/tool.js";

export default function steganographyExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "steganography-agent", STEGANOGRAPHY_SYSTEM_PROMPT, createSteganographyPuzzleTool);
}
