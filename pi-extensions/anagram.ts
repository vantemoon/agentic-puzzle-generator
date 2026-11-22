import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ANAGRAM_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/anagram/prompt.js";
import { createAnagramPuzzleTool } from "../src/features/puzzle-generation/generators/anagram/tool.js";

export default function anagramExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "anagram-agent", ANAGRAM_SYSTEM_PROMPT, createAnagramPuzzleTool);
}
