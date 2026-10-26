import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { VISUAL_CLUE_SYSTEM_PROMPT } from "./prompt.js";
import { createVisualCluePuzzleTool } from "./tool.js";

export const VISUAL_CLUE_MAX_OUTPUT_TOKENS = 16_000;

export async function createVisualClueAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    const streamCompactSvg = ((selectedModel, context, options) =>
        modelRuntime.streamSimple(selectedModel, context, {
            ...options,
            maxTokens: VISUAL_CLUE_MAX_OUTPUT_TOKENS
        })) satisfies typeof modelRuntime.streamSimple;

    return new Agent({
        initialState: {
            systemPrompt: VISUAL_CLUE_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createVisualCluePuzzleTool]
        },

        streamFn: streamCompactSvg,

        toolExecution: "sequential"
    });
}
