import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { SOURCE_CODE_SYSTEM_PROMPT } from "./prompt.js";
import { createSourceCodePuzzleTool } from "./tool.js";

export async function createSourceCodeAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: SOURCE_CODE_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createSourceCodePuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
