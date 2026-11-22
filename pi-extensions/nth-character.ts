import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { NTH_CHARACTER_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/periodic-letter-extraction/prompt.js";
import { createNthCharacterPuzzleTool } from "../src/features/puzzle-generation/generators/periodic-letter-extraction/tool.js";

export default function nthCharacterExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "nth-character-agent", NTH_CHARACTER_SYSTEM_PROMPT, createNthCharacterPuzzleTool);
}
