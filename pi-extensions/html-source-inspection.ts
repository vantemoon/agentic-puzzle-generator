import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { SOURCE_CODE_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/html-source-inspection/prompt.js";
import { createSourceCodePuzzleTool } from "../src/features/puzzle-generation/generators/html-source-inspection/tool.js";

export default function sourceCodeExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "source-code-agent", SOURCE_CODE_SYSTEM_PROMPT, createSourceCodePuzzleTool);
}
