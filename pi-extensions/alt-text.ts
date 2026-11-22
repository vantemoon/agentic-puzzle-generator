import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ALT_TEXT_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/alt-text/prompt.js";
import { createAltTextPuzzleTool } from "../src/features/puzzle-generation/generators/alt-text/tool.js";

export default function altTextExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "alt-text-agent", ALT_TEXT_SYSTEM_PROMPT, createAltTextPuzzleTool);
}
