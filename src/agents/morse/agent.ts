import { Agent } from "../../core/recovering-agent.js";

import { loadKadiModel } from "../../core/model.js";
import { MORSE_SYSTEM_PROMPT } from "./prompt.js";
import { createMorsePuzzleTool } from "./tool.js";

export async function createMorseAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel({ kind: "puzzle", subtype: "morse-code" });
    
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
