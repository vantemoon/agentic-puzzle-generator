import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

import { ANOMALOUS_PHRASE_SYSTEM_PROMPT } from "../src/agents/anomalous-phrase/prompt.js";
import { createAnomalousPhrasePuzzleTool } from "../src/agents/anomalous-phrase/tool.js";

export default function anomalousPhraseExtension(pi: ExtensionAPI) {
    pi.registerTool(createAnomalousPhrasePuzzleTool);
    pi.on("before_agent_start", async (event) => {
        event.systemPromptOptions.sections["anomalous-phrase-agent"] = ANOMALOUS_PHRASE_SYSTEM_PROMPT;
    });
}
