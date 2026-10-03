import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { BINARY_CAPITALIZATION_SYSTEM_PROMPT } from "./prompt.js";
import { createBinaryCapitalizationPuzzleTool } from "./tool.js";

export async function createBinaryCapitalizationAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: BINARY_CAPITALIZATION_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createBinaryCapitalizationPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
