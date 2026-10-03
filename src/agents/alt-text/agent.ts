import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ALT_TEXT_SYSTEM_PROMPT } from "./prompt.js";
import { createAltTextPuzzleTool } from "./tool.js";

export async function createAltTextAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: ALT_TEXT_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createAltTextPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
