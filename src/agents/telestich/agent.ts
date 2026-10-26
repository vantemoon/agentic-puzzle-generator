import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { TELESTICH_SYSTEM_PROMPT } from "./prompt.js";
import { createTelestichPuzzleTool } from "./tool.js";

export async function createTelestichAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: TELESTICH_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createTelestichPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
