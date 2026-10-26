import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT } from "../src/agents/capital-letter-extraction/prompt.js";
import { createCapitalLetterExtractionPuzzleTool } from "../src/agents/capital-letter-extraction/tool.js";

export default function capitalLetterExtractionExtension(pi: ExtensionAPI) {
    pi.registerTool(createCapitalLetterExtractionPuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["capital-letter-extraction-agent"] =
            CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT;
    });
}
