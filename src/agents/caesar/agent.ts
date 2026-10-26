import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { CAESAR_SYSTEM_PROMPT } from "./prompt.js";
import { createCaesarPuzzleTool } from "./tool.js";

export async function createCaesarAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: CAESAR_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createCaesarPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}