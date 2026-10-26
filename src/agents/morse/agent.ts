import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { MORSE_SYSTEM_PROMPT } from "./prompt.js";
import { createMorsePuzzleTool } from "./tool.js";

export async function createMorseAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();
    
    return new Agent({
        initialState: {
            systemPrompt: MORSE_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createMorsePuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}