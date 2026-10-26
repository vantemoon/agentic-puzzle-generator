import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { VISUAL_CLUE_SYSTEM_PROMPT } from "../src/agents/visual-clue/prompt.js";
import { createVisualCluePuzzleTool } from "../src/agents/visual-clue/tool.js";

export default function visualClueExtension(pi: ExtensionAPI) {
  pi.registerTool(createVisualCluePuzzleTool);
  pi.on("before_agent_start", async (event) => {
    event.systemPromptOptions.sections["visual-clue-agent"] = VISUAL_CLUE_SYSTEM_PROMPT;
  });
}
