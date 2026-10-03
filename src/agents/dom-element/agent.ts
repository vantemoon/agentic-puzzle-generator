import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { DOM_ELEMENT_SYSTEM_PROMPT } from "./prompt.js";
import { createDomElementPuzzleTool } from "./tool.js";

export async function createDomElementAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: DOM_ELEMENT_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createDomElementPuzzleTool]
        },

        streamFn: modelRuntime.streamSimple.bind(modelRuntime),

        toolExecution: "sequential"
    });
}
