import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { registerPuzzleExtension } from "./register-puzzle.js";
import { HTML_COMMENT_SYSTEM_PROMPT } from "../src/features/puzzle-generation/generators/html-comment/prompt.js";
import { createHtmlCommentPuzzleTool } from "../src/features/puzzle-generation/generators/html-comment/tool.js";

export default function htmlCommentExtension(pi: ExtensionAPI) {
    registerPuzzleExtension(pi, "html-comment-agent", HTML_COMMENT_SYSTEM_PROMPT, createHtmlCommentPuzzleTool);
}
