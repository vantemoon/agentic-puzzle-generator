import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { HTML_COMMENT_SYSTEM_PROMPT } from "./prompt.js";
import { createHtmlCommentPuzzleTool } from "./tool.js";

export function createHtmlCommentAgent() {
    return createPuzzleAgent({
        subtype: "html-comment",
        systemPrompt: HTML_COMMENT_SYSTEM_PROMPT,
        tool: createHtmlCommentPuzzleTool
    });
}
