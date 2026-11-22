import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { VISUAL_CLUE_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/visual-clue/prompt.js";
import { createVisualCluePuzzleTool } from "../src/features/puzzle-generation/generators/visual-clue/tool.js";

export default function visualClueExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "visual-clue-agent", VISUAL_CLUE_SYSTEM_PROMPT, createVisualCluePuzzleTool);
}
