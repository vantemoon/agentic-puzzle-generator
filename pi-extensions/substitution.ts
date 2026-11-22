import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { SUBSTITUTION_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/monoalphabetic-substitution/prompt.js";
import { createSubstitutionPuzzleTool } from "../src/features/puzzle-generation/generators/monoalphabetic-substitution/tool.js";

export default function substitutionExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "substitution-agent", SUBSTITUTION_SYSTEM_PROMPT, createSubstitutionPuzzleTool);
}
