import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { BINARY_CAPITALIZATION_SYSTEM_PROMPT } from "../src/agents/binary-capitalization/prompt.js";
import { createBinaryCapitalizationPuzzleTool } from "../src/agents/binary-capitalization/tool.js";

export default function binaryCapitalizationExtension(pi: ExtensionAPI) {
    pi.registerTool(createBinaryCapitalizationPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["binary-capitalization-agent"] =
            BINARY_CAPITALIZATION_SYSTEM_PROMPT;
    });
}
