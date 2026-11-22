import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { PAGE_VERSION_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/page-version/prompt.js";
import { createPageVersionPuzzleTool } from "../src/features/puzzle-generation/generators/page-version/tool.js";

export default function pageVersionExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "page-version-agent", PAGE_VERSION_SYSTEM_PROMPT, createPageVersionPuzzleTool);
}
