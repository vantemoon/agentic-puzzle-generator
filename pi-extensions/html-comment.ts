import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { HTML_COMMENT_SYSTEM_PROMPT } from "../src/agents/html-comment/prompt.js";
import { createHtmlCommentPuzzleTool } from "../src/agents/html-comment/tool.js";

export default function htmlCommentExtension(pi: ExtensionAPI) {
  pi.registerTool(createHtmlCommentPuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["html-comment-agent"] = HTML_COMMENT_SYSTEM_PROMPT;
  });
}
