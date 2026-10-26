import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { STATIC_URL_SYSTEM_PROMPT } from "./prompt.js";
import { createStaticUrlPuzzleTool } from "./tool.js";

export async function createStaticUrlAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: STATIC_URL_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createStaticUrlPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
