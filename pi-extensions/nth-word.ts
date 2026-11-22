import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { NTH_WORD_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/periodic-word-extraction/prompt.js";
import { createNthWordPuzzleTool } from "../src/features/puzzle-generation/generators/periodic-word-extraction/tool.js";

export default function nthWordExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "nth-word-agent", NTH_WORD_SYSTEM_PROMPT, createNthWordPuzzleTool);
}
