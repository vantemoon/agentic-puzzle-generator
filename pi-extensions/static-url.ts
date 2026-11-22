import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { STATIC_URL_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/static-url/prompt.js";
import { createStaticUrlPuzzleTool } from "../src/features/puzzle-generation/generators/static-url/tool.js";

export default function staticUrlExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "static-url-agent", STATIC_URL_SYSTEM_PROMPT, createStaticUrlPuzzleTool);
}
