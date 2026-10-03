import { Agent } from "@earendil-works/pi-agent-core";

import { loadKadiModel } from "../../core/model.js";
import { NTH_WORD_SYSTEM_PROMPT } from "./prompt.js";
import { createNthWordPuzzleTool } from "./tool.js";

export async function createNthWordAgent(): Promise<Agent> {
    const { modelRuntime, model } = await loadKadiModel();

    return new Agent({
        initialState: {
            systemPrompt: NTH_WORD_SYSTEM_PROMPT,
            model,
            thinkingLevel: "off",
            tools: [createNthWordPuzzleTool]
        },
        streamFn: modelRuntime.streamSimple.bind(modelRuntime),
        toolExecution: "sequential"
    });
}
