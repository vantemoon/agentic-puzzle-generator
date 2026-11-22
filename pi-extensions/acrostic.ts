import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { ACROSTIC_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/cover-text-line-acrostic/prompt.js";
import { createAcrosticPuzzleTool } from "../src/features/puzzle-generation/generators/cover-text-line-acrostic/tool.js";

export default function acrosticExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "acrostic-agent", ACROSTIC_SYSTEM_PROMPT, createAcrosticPuzzleTool);
}
