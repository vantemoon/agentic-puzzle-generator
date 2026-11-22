import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { WORD_INDEX_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/cover-text-word-index-cipher/prompt.js";
import { createWordIndexPuzzleTool } from "../src/features/puzzle-generation/generators/cover-text-word-index-cipher/tool.js";

export default function wordIndexExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "word-index-agent", WORD_INDEX_SYSTEM_PROMPT, createWordIndexPuzzleTool);
}
