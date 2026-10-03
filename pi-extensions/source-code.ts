import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { SOURCE_CODE_SYSTEM_PROMPT } from "../src/agents/source-code/prompt.js";
import { createSourceCodePuzzleTool } from "../src/agents/source-code/tool.js";

export default function sourceCodeExtension(pi: ExtensionAPI) {
  pi.registerTool(createSourceCodePuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["source-code-agent"] = SOURCE_CODE_SYSTEM_PROMPT;
  });
}
