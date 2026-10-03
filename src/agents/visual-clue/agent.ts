import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { VISUAL_CLUE_SYSTEM_PROMPT } from "./prompt.js";
import { createVisualCluePuzzleTool } from "./tool.js";

export async function createVisualClueAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: VISUAL_CLUE_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createVisualCluePuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
