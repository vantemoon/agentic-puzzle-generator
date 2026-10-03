import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ANOMALOUS_PHRASE_SYSTEM_PROMPT } from "./prompt.js";
import { createAnomalousPhrasePuzzleTool } from "./tool.js";

export async function createAnomalousPhraseAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: ANOMALOUS_PHRASE_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createAnomalousPhrasePuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
