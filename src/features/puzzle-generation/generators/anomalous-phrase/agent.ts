import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { ANOMALOUS_PHRASE_SYSTEM_PROMPT } from "./prompt.js";
import { createAnomalousPhrasePuzzleTool } from "./tool.js";

export function createAnomalousPhraseAgent() {
    return createPuzzleAgent({
        subtype: "anomalous-phrase",
        systemPrompt: ANOMALOUS_PHRASE_SYSTEM_PROMPT,
        tool: createAnomalousPhrasePuzzleTool
    });
}
