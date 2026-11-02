import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT } from "./prompt.js";
import { createCapitalLetterExtractionPuzzleTool } from "./tool.js";

export async function createCapitalLetterExtractionAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel({ kind: "puzzle", subtype: "capital-letter-extraction" });

    return new Agent({
        initialState: {
            systemPrompt: CAPITAL_LETTER_EXTRACTION_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createCapitalLetterExtractionPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
