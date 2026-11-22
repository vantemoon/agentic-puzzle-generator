import { createPuzzleAgent } from "../../../../shared/agent-runtime/puzzle-agent.js";
import { CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT } from "./prompt.js";
import { createCapitalLetterExtractionPuzzleTool } from "./tool.js";

export function createCapitalLetterExtractionAgent() {
    return createPuzzleAgent({
        subtype: "capital-letter-extraction",
        systemPrompt: CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT,
        tool: createCapitalLetterExtractionPuzzleTool
    });
}
