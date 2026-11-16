import { Agent } from "../../core/recovering-agent.js";

import { loadKadiModel } from "../../core/model.js";
import { BINARY_CAPITALIZATION_SYSTEM_PROMPT } from "./prompt.js";
import { createBinaryCapitalizationPuzzleTool } from "./tool.js";

export async function createBinaryCapitalizationAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel({ kind: "puzzle", subtype: "binary-capitalization-pattern" });

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
