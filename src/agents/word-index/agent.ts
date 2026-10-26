import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { WORD_INDEX_SYSTEM_PROMPT } from "./prompt.js";
import { createWordIndexPuzzleTool } from "./tool.js";

export async function createWordIndexAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: WORD_INDEX_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createWordIndexPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
