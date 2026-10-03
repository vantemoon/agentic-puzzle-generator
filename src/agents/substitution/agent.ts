import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { SUBSTITUTION_SYSTEM_PROMPT } from "./prompt.js";
import { createSubstitutionPuzzleTool } from "./tool.js";

export async function createSubstitutionAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: SUBSTITUTION_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createSubstitutionPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
