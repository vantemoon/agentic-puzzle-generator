import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ANAGRAM_SYSTEM_PROMPT } from "./prompt.js";
import { createAnagramPuzzleTool } from "./tool.js";

export async function createAnagramAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: ANAGRAM_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createAnagramPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
