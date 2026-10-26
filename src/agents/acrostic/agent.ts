import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { ACROSTIC_SYSTEM_PROMPT } from "./prompt.js";
import { createAcrosticPuzzleTool } from "./tool.js";

export async function createAcrosticAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: ACROSTIC_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createAcrosticPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
